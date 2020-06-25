module.exports = function (RED) {
    var fs = require('fs')
    var yaml = require("js-yaml");
    const Client = require('kubernetes-client').Client;

    function ConfigureDevice(config) {
        RED.nodes.createNode(this, config);
        var node = this;
        this.device = config.device;
        this.onceDelay = 0.25 * 1000;
        this.namespace = process.env.NAMESPACE || "default";

        this.client = new Client({version: '1.13'})

        var readYaml = (path, cb) => {
            fs.readFile(require.resolve(path), 'utf8', (err, data) => {
                if (err)
                    cb(err);
                else
                    cb(null, yaml.safeLoad(data));
            })
        }
        readYaml('./kubeflow.org_devices.yaml', (err, crd) => {
            if (err) {
                this.error(err);
            } else {
                // this.client.apis['apiextensions.k8s.io'].v1beta1.customresourcedefinitions.post({body: crd})
                //     .catch(err => {
                //         //
                //         // API returns a 409 Conflict if CRD already exists.
                //         //
                //         if (err.statusCode !== 409) this.error(err);
                //     });
                this.client.addCustomResourceDefinition(crd);
            }
        });


        this.onceTimeout = setTimeout(function () {
            node.emit("input", {send: true});
        }, this.onceDelay);


        node.on('input', function (msg) {
            try {
                var context = RED.util.parseContextStore(node.device);
                var target = node.context()["global"];

                if (msg.hasOwnProperty("send")) {
                    target.get(context.key, context.store, (err, val) => {
                        if (err) {
                            node.error(err, msg);
                        } else {
                            this.client.apis['kubeflow.org'].v1.namespaces(node.namespace).devices(node.device).get()
                                .catch(err => {
                                    // console.log("Get Device Error: ", err);
                                    node.error(err, msg);
                                })
                                .then(device => {
                                    if (!device) {
                                        node.error("There is no device by name: " + node.device + " in namespace: " + node.namespace);
                                    } else {
                                        // console.log(device);
                                        try {
                                            device.body.spec.manifest.apps.items = val;
                                        } catch (err) {
                                            node.error(err, msg);
                                        }

                                        this.client.apis['kubeflow.org'].v1.namespaces(node.namespace).devices(node.device).put(device)
                                            .catch(err => {
                                                // console.log("Update Device Error: ", err);
                                                node.error(err, msg);
                                            })
                                            // .then(update => {
                                            //     console.log("Update: ", update);
                                            // })
                                    }
                                })

                        }
                    });
                } else {
                    if (msg.hasOwnProperty("payload")) {
                        payload = msg.payload;
                        target.get(context.key, context.store, (err, current) => {
                            if (err) {
                                node.error(err, msg);
                            } else {
                                if (!current) {
                                    current = [];
                                }
                                current.push(payload);
                                target.set(context.key, current, context.store, function (err) {
                                    if (err) {
                                        node.error(err, msg);
                                    }
                                });
                            }
                        });
                    }
                }
            } catch (err) {
                node.error(err.message, msg);
            }
        });
    }

    RED.nodes.registerType("configure-device", ConfigureDevice);

    ConfigureDevice.prototype.close = function () {
        if (this.onceTimeout) {
            clearTimeout(this.onceTimeout);
        }

        try {
            var context = RED.util.parseContextStore(this.device);
            var target = this.context()["global"];
            target.set(context.key, [], context.store, function (err) {
                if (err) {
                    this.error(err);
                }
            });
        } catch (err) {
            this.error(err.message);
        }
    };

}
