#!/usr/bin/env python3
import json
import math
import random
import statistics
import sys
from collections import Counter, defaultdict
from copy import deepcopy


SEED = 42


def normalize_optional_column_name(value):
    if value in (None, "", "none"):
        return None
    return value


def normalize_value(value):
    if value is None or value == "":
        return "__MISSING__"
    return str(value)


def as_number(value):
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if math.isnan(value) or math.isinf(value):
            return None
        return float(value)
    try:
        parsed = float(str(value).strip())
        if math.isnan(parsed) or math.isinf(parsed):
            return None
        return parsed
    except Exception:
        return None


def infer_numeric_columns(data, excluded):
    columns = list(data[0].keys()) if data else []
    numeric_columns = []
    for column in columns:
        if column in excluded:
            continue
        values = [as_number(row.get(column)) for row in data]
        valid = [value for value in values if value is not None]
        if valid and len(valid) >= max(3, int(len(data) * 0.6)):
            numeric_columns.append(column)
    return numeric_columns


def percentile(sorted_values, fraction):
    if not sorted_values:
        return None
    if fraction <= 0:
        return sorted_values[0]
    if fraction >= 1:
        return sorted_values[-1]
    position = fraction * (len(sorted_values) - 1)
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return sorted_values[lower]
    weight = position - lower
    return sorted_values[lower] * (1 - weight) + sorted_values[upper] * weight


def compute_skewness(values):
    valid = [value for value in values if value is not None]
    if len(valid) < 3:
        return 0.0
    mean = statistics.fmean(valid)
    variance = statistics.fmean([(value - mean) ** 2 for value in valid])
    if variance <= 1e-12:
        return 0.0
    std = math.sqrt(variance)
    return statistics.fmean([((value - mean) / std) ** 3 for value in valid])


def detect_numeric_shape_issues(data, columns):
    issues = []
    for column in columns:
        values = [as_number(row.get(column)) for row in data]
        valid = [value for value in values if value is not None]
        if len(valid) < 5:
            continue
        sorted_values = sorted(valid)
        low_cut = percentile(sorted_values, 0.05)
        high_cut = percentile(sorted_values, 0.95)
        clipped = sum(1 for value in valid if value < low_cut or value > high_cut)
        skewness = compute_skewness(valid)
        if abs(skewness) >= 1.0 or clipped > 0:
            issues.append({
                "column": column,
                "skewness": round(skewness, 3),
                "wouldClipCount": clipped,
                "lowCut": low_cut,
                "highCut": high_cut,
            })
    issues.sort(key=lambda item: (abs(item["skewness"]), item["wouldClipCount"]), reverse=True)
    return issues


def get_scope_columns(payload):
    protected_columns = payload.get("protectedColumns") or []
    scope = payload.get("scope")
    if scope and scope != "__all__":
        return [scope]
    return protected_columns


def get_scope_key(row, scope_columns):
    if not scope_columns:
        return ("__NO_SCOPE__",)
    return tuple(normalize_value(row.get(column)) for column in scope_columns)


def describe_scope_key(scope_columns, scope_key):
    if not scope_columns:
        return "all rows"
    return " | ".join(f"{column}={value}" for column, value in zip(scope_columns, scope_key))


def build_group_summary(data, target_column, scope_columns):
    by_target = defaultdict(lambda: defaultdict(list))
    unique_scope_keys = set()
    unique_targets = set()
    for index, row in enumerate(data):
        target_value = normalize_value(row.get(target_column))
        scope_key = get_scope_key(row, scope_columns)
        by_target[target_value][scope_key].append(index)
        unique_scope_keys.add(scope_key)
        unique_targets.add(target_value)

    missing = []
    for target_value in sorted(unique_targets):
        for scope_key in sorted(unique_scope_keys):
            if scope_key not in by_target[target_value]:
                missing.append({
                    "targetValue": target_value,
                    "scope": describe_scope_key(scope_columns, scope_key),
                })

    counts_by_target = {}
    reference_by_target = {}
    imbalance_ratios = {}
    for target_value, groups in by_target.items():
        counts = {scope_key: len(indices) for scope_key, indices in groups.items()}
        counts_by_target[target_value] = {
            describe_scope_key(scope_columns, scope_key): count
            for scope_key, count in counts.items()
        }
        if counts:
            observed_counts = list(counts.values())
            reference = max(1, math.ceil(sum(observed_counts) / len(observed_counts)))
            reference_by_target[target_value] = reference
            imbalance_ratios[target_value] = round(max(observed_counts) / max(1, min(observed_counts)), 3)
        else:
            reference_by_target[target_value] = 0
            imbalance_ratios[target_value] = 1.0

    return {
        "byTarget": by_target,
        "countsByTarget": counts_by_target,
        "referenceByTarget": reference_by_target,
        "imbalanceRatios": imbalance_ratios,
        "missingCombinations": missing,
    }


def build_plan(payload):
    data = payload.get("data") or []
    target_column = payload.get("targetColumn")
    protected_columns = payload.get("protectedColumns") or []
    ground_truth_column = normalize_optional_column_name(payload.get("groundTruthColumn"))
    label_basis_column = ground_truth_column or target_column

    if not data or not target_column or not protected_columns:
        return {
            "issueSummary": {
                "headline": "Safe remediation needs a dataset, a target column, and at least one protected column.",
                "details": [],
            },
            "recommendations": [],
            "scopeOptions": [],
        }

    scope_options = [{"id": column, "label": column} for column in protected_columns]
    if len(protected_columns) > 1:
        scope_options.insert(0, {"id": "__all__", "label": "All protected columns together"})

    numeric_columns = infer_numeric_columns(
        data,
        set(protected_columns + [target_column] + ([ground_truth_column] if ground_truth_column else [])),
    )
    numeric_issues = detect_numeric_shape_issues(data, numeric_columns)

    default_scope = protected_columns[0]
    scope_summary = build_group_summary(data, label_basis_column, [default_scope])
    max_imbalance = max(scope_summary["imbalanceRatios"].values(), default=1.0)
    all_counts = []
    for target_counts in scope_summary["countsByTarget"].values():
        all_counts.extend(target_counts.values())
    smallest_observed_cell = min(all_counts) if all_counts else 0
    missing_combinations = scope_summary["missingCombinations"]
    collect_more_data_reasons = []

    if missing_combinations:
        collect_more_data_reasons.append(
            "Some protected-group and target combinations do not appear at all in the dataset. No safe transformation can create trustworthy real examples for groups that are completely absent."
        )
    if smallest_observed_cell > 0 and smallest_observed_cell < 2:
        collect_more_data_reasons.append(
            "At least one protected-group and target slice has only one real row. That is too thin for reliable synthetic generation and too fragile for a trustworthy fix."
        )

    recommendations = []

    recommendations.append({
        "id": "sample_weight_reweighing",
        "title": "Sample Weight Rebalancing",
        "family": "fairness-safe",
        "summary": "Adds a weight column instead of changing or deleting rows.",
        "plainEnglish": "This keeps every row exactly as it is, but tells the training pipeline to pay more attention to under-represented cases and a little less attention to over-represented ones.",
        "example": "If women who were approved are rare, those rows get a higher weight instead of being duplicated.",
        "caution": "This is the safest option in this release, but it only helps if the downstream model or trainer actually uses the weight column.",
        "eligible": True,
        "recommended": True,
    })

    recommendations.append({
        "id": "controlled_oversampling",
        "title": "Controlled Duplicate Oversampling",
        "family": "representation-balance",
        "summary": "Creates extra copies of under-represented real rows up to a gentle balancing target.",
        "plainEnglish": "This makes rare groups show up more often in training without inventing new people. It is simple and transparent, but repeated rows can over-emphasize the same pattern.",
        "example": "If approved applicants from one group appear far less often, the tool can duplicate some of those approved rows to narrow the gap.",
        "caution": "Duplicating rows can shift other columns too, so BiasScope previews the side effects before anything is applied.",
        "eligible": max_imbalance > 1.0,
        "recommended": max_imbalance >= 1.2,
    })

    recommendations.append({
        "id": "smote_style_oversampling",
        "title": "SMOTE-Style Synthetic Oversampling",
        "family": "representation-balance",
        "summary": "Generates synthetic rows for under-represented groups using nearby real examples on numeric features.",
        "plainEnglish": "This is similar in spirit to SMOTE. Instead of copying the same row again and again, it builds a synthetic training row between two similar real rows from the same under-represented group.",
        "example": "If two approved rows from an under-represented group have income 40 and 50, a synthetic row may land somewhere between them while keeping the same protected-group label and target label.",
        "caution": "Synthetic rows are not real observations. BiasScope only enables this when enough numeric features and at least two real rows exist in the minority slice.",
        "eligible": len(numeric_columns) >= 2 and max_imbalance > 1.0,
        "recommended": len(numeric_columns) >= 2 and max_imbalance >= 1.35,
    })

    recommendations.append({
        "id": "winsorize_numeric",
        "title": "Numeric Outlier Dampening",
        "family": "distribution-shape",
        "summary": "Clips extreme numeric values to safer percentile cutoffs.",
        "plainEnglish": "This does not change labels or protected groups. It simply reduces the pull of extreme values that can dominate a model.",
        "example": "If one income column has a handful of huge outliers, the tool can cap those extreme values to the 95th percentile.",
        "caution": "This helps with numeric shape and stability, not with missing groups or unfair labels.",
        "eligible": len(numeric_issues) > 0,
        "recommended": len(numeric_issues) > 0,
        "suggestedColumns": [issue["column"] for issue in numeric_issues[:6]],
    })

    recommendations.append({
        "id": "controlled_undersampling",
        "title": "Controlled Undersampling",
        "family": "representation-balance",
        "summary": "Removes some rows from over-represented groups to reduce imbalance.",
        "plainEnglish": "This can make the dataset more balanced, but it throws away information, so we place it behind a stronger warning.",
        "example": "If one group appears far more often than the others for the same target outcome, the tool can trim some of those rows down toward the group average.",
        "caution": "This is the riskiest option here because deleted rows cannot contribute to training later.",
        "eligible": max_imbalance >= 1.25,
        "recommended": False,
    })

    if collect_more_data_reasons:
        recommendations.insert(0, {
            "id": "collect_more_data",
            "title": "Collect More Real Data",
            "family": "data-coverage",
            "summary": "BiasScope found coverage gaps that preprocessing alone cannot honestly fix.",
            "plainEnglish": "This means the dataset is missing important real examples. Reweighting or duplication may still help a little, but they cannot replace missing people or missing cases.",
            "example": "If there are no approved applications at all for one protected group, a safe tool should not pretend it can invent trustworthy examples for that group.",
            "caution": "Treat this as a stop-and-collect-more-data signal before relying on any transformed working copy.",
            "eligible": True,
            "recommended": True,
            "informationalOnly": True,
        })

    details = []
    if max_imbalance > 1.0:
        details.append(f"Detected representation imbalance across {default_scope} within target labels. Worst observed ratio: {max_imbalance}:1.")
    if scope_summary["missingCombinations"]:
        details.append("Some protected-group and target combinations are completely missing. Safe transformations cannot invent those from zero real examples.")
    if numeric_issues:
        details.append(f"Found {len(numeric_issues)} numeric columns with strong skewness or extreme outliers.")
    if not details:
        details.append("No major representation or numeric-shape issues were detected from the current configuration.")

    return {
        "issueSummary": {
            "headline": "BiasScope found a few low-risk preprocessing options you can preview before changing any working copy.",
            "details": details,
        },
        "scopeOptions": scope_options,
        "numericIssues": numeric_issues,
        "targetHandling": {
            "targetColumn": target_column,
            "groundTruthColumn": ground_truth_column,
            "balanceColumn": label_basis_column,
            "mode": ground_truth_column and "ground-truth-first" or "prediction-fallback",
            "message": (
                "BiasScope does not rewrite the target column values. When a ground-truth label is available, safe balancing is anchored to that real outcome column instead of the older model prediction."
                if ground_truth_column
                else "BiasScope does not rewrite the target column values. Because no ground-truth label was provided, it falls back to using the selected target as a reference signal when computing weights or balancing row coverage."
            ),
            "predictionWarning": "If this column is an old model prediction rather than a real-world label, do not treat it as ground truth for retraining. After retraining, your new model's predictions will come from the retrained model, not from this column.",
        },
        "collectMoreDataNotice": {
            "required": len(collect_more_data_reasons) > 0,
            "reasons": collect_more_data_reasons,
        },
        "recommendations": recommendations,
        "groupSummary": {
            "defaultScope": default_scope,
            "countsByTarget": scope_summary["countsByTarget"],
            "missingCombinations": scope_summary["missingCombinations"][:12],
        },
    }


def clone_rows(data):
    return [deepcopy(row) for row in data]


def add_metadata_columns(data, technique_id):
    result = clone_rows(data)
    for index, row in enumerate(result):
        if "biasscope_origin" not in row:
            row["biasscope_origin"] = "original"
        if "biasscope_parent_row_id" not in row:
            row["biasscope_parent_row_id"] = str(index)
        row["biasscope_last_transform"] = technique_id
    return result


def build_reference_targets(group_summary):
    return group_summary["referenceByTarget"]


def count_row_changes(before, after):
    return {
        "originalRows": len(before),
        "transformedRows": len(after),
        "rowsAdded": max(0, len(after) - len(before)),
        "rowsRemoved": max(0, len(before) - len(after)),
    }


def numeric_drift(before, after, columns):
    drifts = []
    for column in columns:
        before_values = [as_number(row.get(column)) for row in before]
        after_values = [as_number(row.get(column)) for row in after]
        before_valid = [value for value in before_values if value is not None]
        after_valid = [value for value in after_values if value is not None]
        if not before_valid or not after_valid:
            continue
        before_mean = statistics.fmean(before_valid)
        after_mean = statistics.fmean(after_valid)
        delta = after_mean - before_mean
        denominator = abs(before_mean) if abs(before_mean) > 1e-9 else 1.0
        drifts.append({
            "column": column,
            "type": "number",
            "before": round(before_mean, 4),
            "after": round(after_mean, 4),
            "change": round(delta, 4),
            "relativeChange": round(delta / denominator, 4),
        })
    drifts.sort(key=lambda item: abs(item["relativeChange"]), reverse=True)
    return drifts[:8]


def categorical_drift(before, after, columns):
    drifts = []
    for column in columns:
        before_counter = Counter(normalize_value(row.get(column)) for row in before)
        after_counter = Counter(normalize_value(row.get(column)) for row in after)
        if not before_counter or not after_counter:
            continue
        before_top, before_count = before_counter.most_common(1)[0]
        after_top, after_count = after_counter.most_common(1)[0]
        drifts.append({
            "column": column,
            "type": "category",
            "beforeTopValue": before_top,
            "beforeTopShare": round(before_count / max(1, len(before)), 4),
            "afterTopValue": after_top,
            "afterTopShare": round(after_count / max(1, len(after)), 4),
            "topValueChanged": before_top != after_top,
        })
    drifts.sort(key=lambda item: abs(item["afterTopShare"] - item["beforeTopShare"]), reverse=True)
    return drifts[:8]


def summarize_drift(before, after, target_column, protected_columns, ground_truth_column):
    excluded = set(protected_columns + [target_column] + ([ground_truth_column] if ground_truth_column else []))
    numeric_columns = infer_numeric_columns(before, excluded)
    all_columns = list(before[0].keys()) if before else []
    categorical_columns = [
        column for column in all_columns
        if column not in excluded and column not in numeric_columns and not column.startswith("biasscope_")
    ]
    return {
        "numeric": numeric_drift(before, after, numeric_columns),
        "categorical": categorical_drift(before, after, categorical_columns),
    }


def sample_preview_rows(rows, limit=5):
    return rows[:limit]


def apply_sample_weight_reweighing(payload):
    data = add_metadata_columns(payload["data"], "sample_weight_reweighing")
    target_column = payload["targetColumn"]
    ground_truth_column = normalize_optional_column_name(payload.get("groundTruthColumn"))
    label_basis_column = ground_truth_column or target_column
    scope_columns = get_scope_columns(payload)
    group_summary = build_group_summary(data, label_basis_column, scope_columns)
    reference_by_target = build_reference_targets(group_summary)
    weight_column = "biasscope_sample_weight"
    warnings = []

    for target_value, groups in group_summary["byTarget"].items():
        reference = reference_by_target[target_value]
        for scope_key, indices in groups.items():
            current = len(indices)
            if current == 0:
                continue
            weight = round(reference / current, 6)
            for index in indices:
                data[index][weight_column] = weight

    if payload.get("scope") == "__all__" and len(scope_columns) > 1:
        warnings.append("Intersectional weighting can produce stronger weights because the slices are smaller.")
    warnings.append("This adds a weight column, but the downstream training pipeline must actually use it.")
    if ground_truth_column:
        warnings.append(f"Balancing used {ground_truth_column} as the label basis, not the older prediction column.")

    return {
        "transformedData": data,
        "summary": {
            **count_row_changes(payload["data"], data),
            "weightColumn": weight_column,
            "warnings": warnings,
            "affectedColumns": [weight_column],
            "sampleRows": sample_preview_rows(data),
        },
    }


def choose_scope_rows(group_rows, needed, rng):
    if needed <= 0:
        return []
    return [rng.choice(group_rows) for _ in range(needed)]


def apply_controlled_oversampling(payload):
    original = add_metadata_columns(payload["data"], "controlled_oversampling")
    data = clone_rows(original)
    target_column = payload["targetColumn"]
    ground_truth_column = normalize_optional_column_name(payload.get("groundTruthColumn"))
    label_basis_column = ground_truth_column or target_column
    scope_columns = get_scope_columns(payload)
    group_summary = build_group_summary(original, label_basis_column, scope_columns)
    reference_by_target = build_reference_targets(group_summary)
    rng = random.Random(SEED)
    appended_rows = []

    for target_value, groups in group_summary["byTarget"].items():
        reference = reference_by_target[target_value]
        for scope_key, indices in groups.items():
            deficit = max(0, reference - len(indices))
            if deficit <= 0:
                continue
            chosen_indices = choose_scope_rows(indices, deficit, rng)
            for source_index in chosen_indices:
                row = deepcopy(original[source_index])
                row["biasscope_origin"] = "duplicate"
                row["biasscope_parent_row_id"] = str(source_index)
                data.append(row)
                appended_rows.append(row)

    warnings = [
        "Duplicated rows are real rows repeated on purpose. This can help representation balance, but it can also over-emphasize repeated patterns.",
    ]
    if ground_truth_column:
        warnings.append(f"Balancing used {ground_truth_column} as the label basis, not the older prediction column.")

    return {
        "transformedData": data,
        "summary": {
            **count_row_changes(payload["data"], data),
            "duplicatedRows": len(appended_rows),
            "warnings": warnings,
            "affectedColumns": ["biasscope_origin", "biasscope_parent_row_id"],
            "sampleRows": sample_preview_rows(appended_rows or data),
        },
    }


def euclidean_distance(row_a, row_b, numeric_columns):
    total = 0.0
    used = 0
    for column in numeric_columns:
        value_a = as_number(row_a.get(column))
        value_b = as_number(row_b.get(column))
        if value_a is None or value_b is None:
            continue
        total += (value_a - value_b) ** 2
        used += 1
    if used == 0:
        return None
    return math.sqrt(total)


def nearest_neighbor_index(source_index, indices, rows, numeric_columns):
    candidates = []
    source_row = rows[source_index]
    for candidate_index in indices:
        if candidate_index == source_index:
            continue
        distance = euclidean_distance(source_row, rows[candidate_index], numeric_columns)
        if distance is None:
            continue
        candidates.append((distance, candidate_index))
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0])
    return candidates[0][1]


def build_synthetic_row(source_row, neighbor_row, numeric_columns, protected_columns, target_column, ground_truth_column, rng):
    synthetic = {}
    for column, value in source_row.items():
        if column.startswith("biasscope_"):
            continue
        if column in protected_columns or column == target_column or column == ground_truth_column:
            synthetic[column] = source_row.get(column)
            continue
        if column in numeric_columns:
            first = as_number(source_row.get(column))
            second = as_number(neighbor_row.get(column))
            if first is None and second is None:
                synthetic[column] = source_row.get(column)
            elif first is None:
                synthetic[column] = second
            elif second is None:
                synthetic[column] = first
            else:
                alpha = rng.random()
                synthetic[column] = round(first + alpha * (second - first), 6)
            continue
        synthetic[column] = source_row.get(column) if rng.random() < 0.5 else neighbor_row.get(column)
    synthetic["biasscope_origin"] = "synthetic_smote"
    synthetic["biasscope_parent_row_id"] = f"{source_row.get('biasscope_parent_row_id', '')}|{neighbor_row.get('biasscope_parent_row_id', '')}"
    synthetic["biasscope_last_transform"] = "smote_style_oversampling"
    return synthetic


def apply_smote_style_oversampling(payload):
    original = add_metadata_columns(payload["data"], "smote_style_oversampling")
    data = clone_rows(original)
    target_column = payload["targetColumn"]
    protected_columns = payload.get("protectedColumns") or []
    ground_truth_column = normalize_optional_column_name(payload.get("groundTruthColumn"))
    label_basis_column = ground_truth_column or target_column
    scope_columns = get_scope_columns(payload)
    numeric_columns = infer_numeric_columns(
        original,
        set(protected_columns + [target_column] + ([ground_truth_column] if ground_truth_column else [])),
    )
    group_summary = build_group_summary(original, label_basis_column, scope_columns)
    reference_by_target = build_reference_targets(group_summary)
    rng = random.Random(SEED)
    synthetic_rows = []
    warnings = []

    for target_value, groups in group_summary["byTarget"].items():
        reference = reference_by_target[target_value]
        for scope_key, indices in groups.items():
            deficit = max(0, reference - len(indices))
            if deficit <= 0:
                continue
            if len(indices) < 2:
                warnings.append(f"Skipped {describe_scope_key(scope_columns, scope_key)} with target {target_value} because it has fewer than two real rows.")
                continue
            for step in range(deficit):
                source_index = indices[step % len(indices)]
                neighbor_index = nearest_neighbor_index(source_index, indices, original, numeric_columns)
                if neighbor_index is None:
                    warnings.append(f"Skipped synthetic generation for {describe_scope_key(scope_columns, scope_key)} because numeric neighbors were not available.")
                    break
                row = build_synthetic_row(
                    original[source_index],
                    original[neighbor_index],
                    numeric_columns,
                    protected_columns,
                    target_column,
                    ground_truth_column,
                    rng,
                )
                data.append(row)
                synthetic_rows.append(row)

    if not synthetic_rows:
        warnings.append("No synthetic rows were generated. Consider sample weighting or duplicate oversampling instead.")
    if ground_truth_column:
        warnings.append(f"Balancing used {ground_truth_column} as the label basis, not the older prediction column.")

    return {
        "transformedData": data,
        "summary": {
            **count_row_changes(payload["data"], data),
            "syntheticRows": len(synthetic_rows),
            "warnings": warnings,
            "affectedColumns": numeric_columns[:8] + ["biasscope_origin", "biasscope_parent_row_id"],
            "sampleRows": sample_preview_rows(synthetic_rows or data),
        },
    }


def apply_controlled_undersampling(payload):
    original = add_metadata_columns(payload["data"], "controlled_undersampling")
    target_column = payload["targetColumn"]
    ground_truth_column = normalize_optional_column_name(payload.get("groundTruthColumn"))
    label_basis_column = ground_truth_column or target_column
    scope_columns = get_scope_columns(payload)
    group_summary = build_group_summary(original, label_basis_column, scope_columns)
    rng = random.Random(SEED)
    kept_indices = set()
    removed = 0

    for target_value, groups in group_summary["byTarget"].items():
        counts = [len(indices) for indices in groups.values()]
        if not counts:
            continue
        reference = max(1, math.ceil(sum(counts) / len(counts)))
        for scope_key, indices in groups.items():
            if len(indices) <= reference:
                kept_indices.update(indices)
                continue
            shuffled = indices[:]
            rng.shuffle(shuffled)
            kept = shuffled[:reference]
            kept_indices.update(kept)
            removed += len(indices) - len(kept)

    data = [deepcopy(original[index]) for index in sorted(kept_indices)]
    warnings = [
        "This deleted rows from over-represented groups. Review the preview carefully because information was intentionally removed.",
    ]
    if ground_truth_column:
        warnings.append(f"Balancing used {ground_truth_column} as the label basis, not the older prediction column.")

    return {
        "transformedData": data,
        "summary": {
            **count_row_changes(payload["data"], data),
            "removedRows": removed,
            "warnings": warnings,
            "affectedColumns": [],
            "sampleRows": sample_preview_rows(data),
        },
    }


def apply_winsorize_numeric(payload):
    original = clone_rows(payload["data"])
    data = clone_rows(payload["data"])
    target_column = payload["targetColumn"]
    protected_columns = payload.get("protectedColumns") or []
    ground_truth_column = normalize_optional_column_name(payload.get("groundTruthColumn"))
    requested_columns = payload.get("selectedColumns") or []
    excluded = set(protected_columns + [target_column] + ([ground_truth_column] if ground_truth_column else []))
    numeric_columns = infer_numeric_columns(original, excluded)
    selected_columns = [column for column in requested_columns if column in numeric_columns] or numeric_columns[:4]
    low_fraction = 0.05
    high_fraction = 0.95
    changes = []

    for column in selected_columns:
        values = [as_number(row.get(column)) for row in original]
        valid = [value for value in values if value is not None]
        if len(valid) < 5:
            continue
        sorted_values = sorted(valid)
        low_cut = percentile(sorted_values, low_fraction)
        high_cut = percentile(sorted_values, high_fraction)
        changed_count = 0
        for index, row in enumerate(data):
            value = as_number(row.get(column))
            if value is None:
                continue
            clipped = min(max(value, low_cut), high_cut)
            if clipped != value:
                changed_count += 1
                row[column] = round(clipped, 6)
        changes.append({
            "column": column,
            "lowCut": round(low_cut, 6),
            "highCut": round(high_cut, 6),
            "changedCount": changed_count,
        })

    warnings = [
        "This only dampens extreme numeric values. It does not fix unfair labels or absent groups by itself.",
    ]

    return {
        "transformedData": data,
        "summary": {
            **count_row_changes(payload["data"], data),
            "winsorizedColumns": changes,
            "warnings": warnings,
            "affectedColumns": [change["column"] for change in changes],
            "sampleRows": sample_preview_rows(data),
        },
    }


def run_transformation(payload):
    technique_id = payload.get("techniqueId")
    if technique_id == "sample_weight_reweighing":
        return apply_sample_weight_reweighing(payload)
    if technique_id == "controlled_oversampling":
        return apply_controlled_oversampling(payload)
    if technique_id == "smote_style_oversampling":
        return apply_smote_style_oversampling(payload)
    if technique_id == "controlled_undersampling":
        return apply_controlled_undersampling(payload)
    if technique_id == "winsorize_numeric":
        return apply_winsorize_numeric(payload)
    raise ValueError(f"Unsupported technique: {technique_id}")


def main():
    action = sys.argv[1] if len(sys.argv) > 1 else "plan"
    payload = json.load(sys.stdin)

    if action == "plan":
        print(json.dumps(build_plan(payload)))
        return

    result = run_transformation(payload)
    result["driftSummary"] = summarize_drift(
        payload["data"],
        result["transformedData"],
        payload.get("targetColumn"),
        payload.get("protectedColumns") or [],
        payload.get("groundTruthColumn"),
    )
    print(json.dumps(result))


if __name__ == "__main__":
    main()
