const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const cors = require('cors'); // Import the cors middleware

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
    credentials: true,
    origin: true
}));

app.use(bodyParser.json());

app.post('/api/qr-code', (req, res) => {
    const { qrText } = req.body;

    updateConfigMap(qrText)
        .then(() => reloadHomeAssistant())
        .then(() => res.status(200).send('ConfigMap updated and Home Assistant reloaded'))
        .catch(error => {
            console.error('Error updating ConfigMap or reloading Home Assistant:', error);
            res.status(500).send('Failed to update ConfigMap or reload Home Assistant');
        });
});

const updateConfigMap = (qrText) => {
    return new Promise((resolve, reject) => {
        // Fetch the existing ConfigMap
        exec('kubectl get configmap home-assistant-config --namespace iot-home-assistant -o json', (error, stdout, stderr) => {
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

            // Extract and update the configuration.yaml content
            let configurationYaml = configMap.data['configuration.yaml'];
            configurationYaml += `\n\n        - name: "${qrText}"`;

            // Prepare the patch
            const patch = {
                data: {
                    'configuration.yaml': configurationYaml
                }
            };

            // Patch the ConfigMap
            exec(`kubectl patch configmap home-assistant-config --namespace iot-home-assistant --type merge --patch '${JSON.stringify(patch)}'`, (patchError, patchStdout, patchStderr) => {
                if (patchError) {
                    console.error('Error updating ConfigMap:', patchError);
                    return reject(patchError);
                }
                console.log('ConfigMap updated:', patchStdout);
                resolve();
            });
        });
    });
};

const reloadHomeAssistant = () => {
    return new Promise((resolve, reject) => {
        const command = 'kubectl rollout restart deployment/homeassistant --namespace iot-home-assistant';

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error('Error reloading Home Assistant deployment:', error);
                return reject(error);
            }
            console.log('Home Assistant deployment reloaded:', stdout);
            resolve();
        });
    });
};

app.listen(PORT, () => {
    console.log(`Backend service running on port ${PORT}`);
});
