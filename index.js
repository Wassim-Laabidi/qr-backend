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
// Function to update the ConfigMap with new QR text
const updateConfigMap = (qrText) => {
    return new Promise((resolve, reject) => {
        exec(
            'kubectl get configmap home-assistant-config --namespace iot-home-assistant -o json',
            (error, stdout) => {
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

                let configurationYaml = configMap.data['configuration.yaml'] || '';

                const firstLine = qrText.split('\n')[0].trim();
                const containsSensor = firstLine.includes('sensor');
                const containsSwitch = firstLine.includes('switch');

                if (!containsSensor && !containsSwitch) {
                    console.log('Scanned QR code does not match "sensor" or "switch" criteria:', firstLine);
                    return resolve('No matching "sensor" or "switch" in scanned QR code.');
                }

                if (configurationYaml.includes(firstLine)) {
                    console.log('Device already scanned:', firstLine);
                    return resolve('Device already scanned');
                }

                // Escape special characters for YAML
                const escapedQrText = qrText.replace(/\\/g, '\\\\');
                const lines = escapedQrText.split('\n');
                const formattedLines = lines.map((line, index) => {
                    const indent = index === 0 ? '    ' : '    ';
                    return `${indent}${line}`;
                });
                const formattedQrText = formattedLines.join('\n');

                let insertPosition;
                if (containsSensor) {
                    insertPosition = configurationYaml.indexOf('sensor:');
                } else if (containsSwitch) {
                    insertPosition = configurationYaml.indexOf('switch:');
                }

                if (insertPosition !== -1) {
                    // Insert the formatted QR text before the relevant block (sensor or switch)
                    configurationYaml =
                        configurationYaml.slice(0, insertPosition + 7) +
                        `\n\n${formattedQrText}\n` +
                        configurationYaml.slice(insertPosition + 7);
                } else {
                    // Append the QR text at the end if the block is not found
                    // configurationYaml += `\n\n${formattedQrText}`;
                }

                const patch = {
                    data: {
                        'configuration.yaml': configurationYaml,
                    },
                };

                const patchJson = JSON.stringify(patch, null, 2);
                const fs = require('fs');
                const tmpFilePath = '/tmp/patch.json';

                fs.writeFile(tmpFilePath, patchJson, (err) => {
                    if (err) {
                        console.error('Error writing patch file:', err);
                        return reject(err);
                    }

                    exec(
                        `kubectl patch configmap home-assistant-config --namespace iot-home-assistant --patch-file="${tmpFilePath}"`,
                        (patchError, patchStdout) => {
                            if (patchError) {
                                console.error('Error updating ConfigMap:', patchError);
                                return reject(patchError);
                            }
                            console.log('ConfigMap updated successfully:', patchStdout);

                            fs.unlink(tmpFilePath, (unlinkErr) => {
                                if (unlinkErr) {
                                    console.error('Error deleting temporary patch file:', unlinkErr);
                                }
                                resolve();
                            });
                        }
                    );
                });
            }
        );
    });
};


// Function to reload the Home Assistant deployment
const reloadHomeAssistant = () => {
    return new Promise((resolve, reject) => {
        exec('kubectl rollout restart deployment/iot-home-assistant --namespace iot-home-assistant', (error, stdout) => {
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