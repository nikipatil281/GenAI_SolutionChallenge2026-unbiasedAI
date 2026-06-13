#!/usr/bin/env python3
import base64
import json
import math
import os
import sys
import tempfile
from typing import Any

import joblib
import pandas as pd


PREDICTION_COLUMN = "model_prediction"
GROUND_TRUTH_COLUMN = "ground_truth_label"
SCORE_COLUMN = "model_score_positive"


def normalize_value(value: Any) -> Any:
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if pd.isna(value):
        return None
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            return value
    return value


def decode_file(target_dir: str, file_payload: dict[str, Any]) -> str:
    file_name = file_payload.get("name") or "uploaded_file"
    content_base64 = file_payload.get("contentBase64")
    if not content_base64:
      raise ValueError(f"Missing file content for {file_name}.")

    raw_bytes = base64.b64decode(content_base64)
    file_path = os.path.join(target_dir, file_name)
    with open(file_path, "wb") as handle:
        handle.write(raw_bytes)
    return file_path


def read_dataset(dataset_path: str) -> pd.DataFrame:
    lower_name = dataset_path.lower()
    if lower_name.endswith(".csv"):
        return pd.read_csv(dataset_path)
    if lower_name.endswith(".xlsx") or lower_name.endswith(".xls"):
        return pd.read_excel(dataset_path)
    raise ValueError("Unsupported dataset format. Please upload CSV or Excel.")


def infer_positive_label(values: list[Any], suggested_labels: list[Any] | None = None) -> Any:
    cleaned = [normalize_value(value) for value in values if normalize_value(value) is not None]
    if not cleaned:
        return 1

    if suggested_labels:
        cleaned_suggested = [normalize_value(label) for label in suggested_labels if normalize_value(label) is not None]
        if 1 in cleaned_suggested:
            return 1
        if True in cleaned_suggested:
            return True
        truthy_strings = [label for label in cleaned_suggested if isinstance(label, str) and label.strip().lower() in {"yes", "true", "approved", "accept", "positive", ">50k", ">50k."}]
        if truthy_strings:
            return truthy_strings[0]
        if len(cleaned_suggested) >= 2:
            return cleaned_suggested[-1]

    if 1 in cleaned:
        return 1
    if True in cleaned:
        return True

    preferred_strings = ["yes", "true", "approved", "accept", "positive", ">50k", ">50k."]
    for preferred in preferred_strings:
        for original in cleaned:
            if isinstance(original, str) and original.strip().lower() == preferred:
                return original

    unique_values = list(dict.fromkeys(cleaned))
    if len(unique_values) == 2:
        return unique_values[-1]

    return unique_values[-1]


def to_binary(values: list[Any], positive_label: Any) -> list[int]:
    binary_values = []
    positive_normalized = normalize_value(positive_label)
    positive_string = str(positive_normalized).strip().lower() if positive_normalized is not None else None

    for value in values:
        current = normalize_value(value)
        if current is None:
            binary_values.append(0)
            continue
        if current == positive_normalized:
            binary_values.append(1)
            continue
        if isinstance(current, str) and positive_string is not None and current.strip().lower() == positive_string:
            binary_values.append(1)
            continue
        binary_values.append(0)
    return binary_values


def main():
    payload = json.load(sys.stdin)
    model_type = payload.get("modelType")
    if model_type != "sklearn":
        raise ValueError("Executable model audit currently supports Scikit-Learn .pkl and .joblib files only.")

    model_file = payload.get("modelFile") or {}
    dataset_file = payload.get("datasetFile") or {}
    training_columns = payload.get("trainingColumns") or []
    ground_truth_source = payload.get("groundTruthColumn")
    protected_columns = payload.get("protectedColumns") or []

    independent_columns = [column.get("name") for column in training_columns if column.get("role") == "independent" and column.get("name")]
    if not independent_columns:
        raise ValueError("At least one independent feature column is required for execution.")

    with tempfile.TemporaryDirectory() as temp_dir:
        model_path = decode_file(temp_dir, model_file)
        dataset_path = decode_file(temp_dir, dataset_file)

        dataset_frame = read_dataset(dataset_path)
        if dataset_frame.empty:
            raise ValueError("The uploaded dataset is empty.")

        model = joblib.load(model_path)
        model_feature_names = getattr(model, "feature_names_in_", None)
        runtime_feature_columns = list(model_feature_names) if model_feature_names is not None else independent_columns
        warnings = []

        if model_feature_names is not None:
            manifest_only_columns = [column for column in independent_columns if column not in runtime_feature_columns]
            if manifest_only_columns:
                warnings.append(
                    "Some schema columns were ignored during execution because the uploaded sklearn model advertises a different feature list: "
                    + ", ".join(manifest_only_columns)
                )

        missing_columns = [column for column in runtime_feature_columns if column not in dataset_frame.columns]
        if missing_columns:
            raise ValueError(
                "The uploaded dataset is missing required feature columns: " + ", ".join(missing_columns)
            )

        missing_protected = [column for column in protected_columns if column not in dataset_frame.columns]
        if missing_protected:
            raise ValueError(
                "The uploaded dataset is missing protected columns required for fairness analysis: " + ", ".join(missing_protected)
            )

        feature_frame = dataset_frame[runtime_feature_columns].copy()

        raw_predictions = list(model.predict(feature_frame))
        classes = list(getattr(model, "classes_", [])) or None
        positive_label = infer_positive_label(raw_predictions, classes)
        normalized_predictions = to_binary(raw_predictions, positive_label)

        probability_values = None
        if hasattr(model, "predict_proba"):
            probability_matrix = model.predict_proba(feature_frame)
            if getattr(probability_matrix, "shape", None) and probability_matrix.shape[1] >= 2:
                class_values = classes or list(range(probability_matrix.shape[1]))
                if positive_label in class_values:
                    positive_index = class_values.index(positive_label)
                else:
                    positive_index = probability_matrix.shape[1] - 1
                probability_values = probability_matrix[:, positive_index].tolist()

        normalized_truth = None
        truth_positive_label = None
        if ground_truth_source:
            if ground_truth_source not in dataset_frame.columns:
                raise ValueError(f'The selected ground truth column "{ground_truth_source}" is not present in the uploaded dataset.')
            truth_values = dataset_frame[ground_truth_source].tolist()
            truth_positive_label = infer_positive_label(truth_values, classes or [positive_label])
            normalized_truth = to_binary(truth_values, truth_positive_label)

        result_frame = dataset_frame.copy()
        result_frame[PREDICTION_COLUMN] = normalized_predictions
        if normalized_truth is not None:
            result_frame[GROUND_TRUTH_COLUMN] = normalized_truth
        if probability_values is not None:
            result_frame[SCORE_COLUMN] = [round(float(value), 6) for value in probability_values]

        preview_columns = [
            column
            for column in runtime_feature_columns[:6] + protected_columns + [ground_truth_source or "", PREDICTION_COLUMN, SCORE_COLUMN]
            if column and column in result_frame.columns
        ]
        preview_columns = list(dict.fromkeys(preview_columns))

        output = {
            "supported": True,
            "modelType": model_type,
            "predictionColumn": PREDICTION_COLUMN,
            "groundTruthColumn": GROUND_TRUTH_COLUMN if normalized_truth is not None else None,
            "groundTruthSourceColumn": ground_truth_source,
            "scoreColumn": SCORE_COLUMN if probability_values is not None else None,
            "featureColumnsUsed": runtime_feature_columns,
            "manifestIndependentColumns": independent_columns,
            "protectedColumns": protected_columns,
            "rowCount": int(len(result_frame)),
            "missingValuesDetected": int(result_frame.isna().sum().sum()),
            "positiveLabelChosen": normalize_value(positive_label),
            "truthPositiveLabelChosen": normalize_value(truth_positive_label) if truth_positive_label is not None else None,
            "warnings": warnings,
            "auditData": result_frame.to_dict(orient="records"),
            "previewRows": result_frame[preview_columns].head(8).to_dict(orient="records"),
        }

        print(json.dumps(output))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        sys.stderr.write(str(exc))
        sys.exit(1)
