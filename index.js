const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3002;

// CORS configuration
const corsOptions = {
    credentials: true,
    origin: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-Trigger', 'content-type', 'origin', 'accept'],
    optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(bodyParser.json());

// API route to handle QR code processing
app.post('/api/qr-code', async (req, res) => {
    try {
        const { qrText } = req.body;
        console.log("Received qrText:", qrText);

        // Validate qrText
        if (typeof qrText !== 'string' || !qrText.trim()) {
            return res.status(400).json({ success: false, message: "Invalid QR text" });
        }

        // Update ConfigMap and reload Home Assistant
        await updateConfigMap(qrText);
        await reloadHomeAssistant();

        // Respond with success
        res.status(200).json({ success: true, message: "QR code processed, ConfigMap updated, and Home Assistant reloaded successfully" });

    } catch (error) {
        console.error("Error processing request:", error);

        // Respond with error
        res.status(500).json({ success: false, message: "Failed to process the request, update ConfigMap, or reload Home Assistant" });
    }
});

// Function to update the ConfigMap with new QR text
const updateConfigMap = (qrText) => {
    return new Promise((resolve, reject) => {
        exec('kubectl get configmap home-assistant-config --namespace iot-home-assistant -o json', (error, stdout) => {
            if (error) {
                console.error('Error fetching ConfigMap:', error);
                return reject(error);
            }

            let configMap;
            try {
                configMap = JSON.parse(stdout);
            } catch (parseError) {
                console.error('Error parsing ConfigMap JSON:', parseError);
                return reject(parseError);
            }

            // Append new data to the existing configuration
            let configurationYaml = configMap.data['configuration.yaml'] || '';
            configurationYaml += `\n\n        - name: "${qrText}"`;

            // Create patch object
            const patch = {
                data: {
                    'configuration.yaml': configurationYaml
                }
            };

            // Properly escape JSON for the patch command
            const patchJson = JSON.stringify(patch).replace(/'/g, "\\'").replace(/"/g, '\\"');

            // Apply the patch
            exec(`kubectl patch configmap home-assistant-config --namespace iot-home-assistant --type merge --patch "${patchJson}"`, (patchError, patchStdout) => {
                if (patchError) {
                    console.error('Error updating ConfigMap:', patchError);
                    return reject(patchError);
                }
                console.log('ConfigMap updated successfully:', patchStdout);
                resolve();
            });
        });
    });
};

// Function to reload the Home Assistant deployment
const reloadHomeAssistant = () => {
    return new Promise((resolve, reject) => {
        exec('kubectl rollout restart deployment/homeassistant --namespace iot-home-assistant', (error, stdout) => {
            if (error) {
                console.error('Error reloading Home Assistant deployment:', error);
                return reject(error);
            }
            console.log('Home Assistant deployment reloaded successfully:', stdout);
            resolve();
        });
    });
};

// Start the server
app.listen(PORT, () => {
    console.log(`Backend service running on port ${PORT}`);
});
