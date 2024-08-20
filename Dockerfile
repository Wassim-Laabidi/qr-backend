FROM node:14

# Disable interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Step 1: Install kubectl
RUN apt-get update && \
    apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key | gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg && \
    echo 'deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v1.30/deb/ /' | tee /etc/apt/sources.list.d/kubernetes.list && \
    apt-get update && \
    apt-get install -y kubectl && \
    apt-get clean

# Step 2: Install Node.js dependencies
WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Expose the application port
EXPOSE 3002

# Step 3: Set the entry point for the application
CMD ["node", "index.js"]
