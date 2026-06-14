FROM node:22-bookworm-slim

# Install Python and poppler-utils (for pdftotext/pdfinfo)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
RUN pip install --no-cache-dir -r requirements.txt

# Install Node dependencies
COPY package*.json ./
RUN npm install

# Copy application code
COPY . .

# Build the frontend and backend
RUN npm run build

# Expose port (Cloud Run sets PORT, default is 8080)
ENV PORT=8080
EXPOSE $PORT

# Start the application
CMD ["npm", "run", "start"]
