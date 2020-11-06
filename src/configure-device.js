module.exports = function (RED) {
    var fs = require('fs')
    var yaml = require("js-yaml");
    const Client = require('kubernetes-client').Client;
    var client = new Client({version: '1.13'});
    var namespace = process.env.NAMESPACE || "default";

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
            console.log(err);
        } else {
            // this.client.apis['apiextensions.k8s.io'].v1beta1.customresourcedefinitions.post({body: crd})
            //     .catch(err => {
            //         //
            //         // API returns a 409 Conflict if CRD already exists.
            //         //
            //         if (err.statusCode !== 409) this.error(err);
            //     });
            client.addCustomResourceDefinition(crd);
        }
    });

    function ConfigureDevice(config) {
        RED.nodes.createNode(this, config);
        this.devices = config.devices.map(device => JSON.parse(device).name);
        this.metadatalabels = config.metadatalabels.map(label => {
            return {[label.key]: label.value};
        });
        var mode = config.mode || "select";
        this.onceDelay = 0.25 * 1000;
        this.namespace = namespace;
        this.client = client;
        var node = this;

        this.onceTimeout = setTimeout(function () {
            node.emit("input", {send: true});
        }, this.onceDelay);

        if (mode === "select") {
            node.on('input', function (msg) {
                try {
                    var context = RED.util.parseContextStore(node.id);
                    var target = node.context()["global"];

                    if (msg.hasOwnProperty("send")) {
                        target.get(context.key, context.store, (err, val) => {
                            if (err) {
                                node.error(err, msg);
                                node.status({fill: "red", shape: "dot", text: err});
                            } else {
                                if (!val) {
                                    node.error("There is no config to deploy, please connect some configuration nodes");
                                    node.status({fill: "red", shape: "dot", text: "No configuration nodes attached"});
                                } else {
                                    node.devices.forEach(deviceName => {
                                        this.client.apis['kubeflow.org'].v1.namespaces(node.namespace).devices(deviceName).get()
                                            .catch(err => {
                                                // console.log("Get Device Error: ", err);
                                                node.error(err, msg);
                                                node.status({fill: "red", shape: "dot", text: err});
                                            })
                                            .then(device => {
                                                if (!device) {
                                                    node.error("There is no device by name: " + deviceName + " in namespace: " + node.namespace);
                                                    node.status({fill: "red", shape: "dot", text: "There is no device by name: " + deviceName + " in namespace: " + node.namespace});
                                                } else {
                                                    // console.log(device);
                                                    try {
                                                        // device.body.spec.manifest.apps.items = val;
                                                        device.body.spec.manifest.apps.items = JSON.parse(JSON.stringify(val));
                                                        device.body.spec.manifest.apps.items.forEach(manifest => {
                                                            manifest.spec.template.spec.containers.forEach(container => {
                                                                if (!container.hasOwnProperty('env')) {
                                                                    container['env'] = [];
                                                                }
                                                                container.env.push({ name: 'LABEL_DEVICE_ID', value: device.body.metadata.name });
                                                                container.env.push({ name: 'LABEL_NAMESPACE', value: namespace });
                                                                Object.keys(device.body.metadata.labels).forEach(key => {
                                                                    container.env.push({
                                                                        name: 'LABEL_'+key.toLocaleUpperCase(),
                                                                        value: device.body.metadata.labels[key]
                                                                    });
                                                                })
                                                            })
                                                        })
                                                    } catch (err) {
                                                        node.error(err, msg);
                                                        node.status({fill: "red", shape: "dot", text: err});
                                                    }

                                                    this.client.apis['kubeflow.org'].v1.namespaces(node.namespace).devices(deviceName).put(device)
                                                        .catch(err => {
                                                            // console.log("Update Device Error: ", err);
                                                            node.error(err, msg);
                                                            node.status({fill: "red", shape: "dot", text: err});
                                                        })
                                                    // .then(update => {
                                                    //     console.log("Update: ", update);
                                                    // })
                                                }
                                            })
                                    });
                                    node.status({fill: "green", shape: "dot", text: "Updated: \n" + node.devices.map(device => device + " \n")});
                                }
                            }
                        });
                    } else {
                        if (msg.hasOwnProperty("payload")) {
                            payload = msg.payload;
                            target.get(context.key, context.store, (err, current) => {
                                if (err) {
                                    node.error(err, msg);
                                    node.status({fill: "red", shape: "dot", text: err});
                                } else {
                                    if (!current) {
                                        current = [];
                                    }
                                    current.push(payload);
                                    target.set(context.key, current, context.store, function (err) {
                                        if (err) {
                                            node.error(err, msg);
                                            node.status({fill: "red", shape: "dot", text: err});
                                        }
                                    });
                                }
                            });
                        }
                    }
                } catch (err) {
                    node.error(err.message, msg);
                    node.status({fill: "red", shape: "dot", text: err});
                }
            });
        } else if (mode === "labels") {
            node.on('input', function (msg) {
                try {
                    var context = RED.util.parseContextStore(node.id);
                    var target = node.context()["global"];

                    if (msg.hasOwnProperty("send")) {
                        target.get(context.key, context.store, (err, val) => {
                            if (err) {
                                node.error(err, msg);
                                node.status({fill: "red", shape: "dot", text: err});
                            } else {
                                if (!val) {
                                    node.error("There is no config to deploy, please connect some configuration nodes");
                                    node.status({fill: "red", shape: "dot", text: "No configuration nodes attached"});
                                } else {
                                    client.apis['kubeflow.org'].v1.namespaces(namespace).devices().get()
                                        .catch(err => {
                                            // console.log("Get Device Error: ", err);
                                            node.error(err, msg);
                                            node.status({fill: "red", shape: "dot", text: err});
                                        })
                                        .then(devices => {

                                            var filtered = devices.body.items.filter(device => {
                                                return node.metadatalabels.reduce((matchingAllLabels, label1) => {
                                                    return matchingAllLabels && Object.keys(label1).reduce((matchingAll, key1) => {
                                                        // console.log("OuterLabel: " + key1 + ":" + label1[key1]);
                                                        // console.dir(device.metadata.labels);
                                                        return matchingAll && Object.keys(device.metadata.labels).reduce((matching, key2) => {
                                                            // console.log("InnerLabel: " + key2 + ":" + device.metadata.labels[key2]);
                                                            // if (key1 === key2 && label1[key1] === device.metadata.labels[key2]) {
                                                            //     console.log("Found match!")
                                                            // }
                                                            return matching || (key1 === key2 && label1[key1] === device.metadata.labels[key2]);
                                                        }, false);
                                                    }, true);
                                                }, true);
                                            });

                                            filtered.forEach((device) => {
                                                // console.dir(device);

                                                try {
                                                    // device.spec.manifest.apps.items = val;
                                                    device.spec.manifest.apps.items = JSON.parse(JSON.stringify(val));
                                                    device.spec.manifest.apps.items.forEach(manifest => {
                                                        manifest.spec.template.spec.containers.forEach(container => {
                                                            if (!container.hasOwnProperty('env')) {
                                                                container['env'] = [];
                                                            }
                                                            container.env.push({ name: 'LABEL_DEVICE_ID', value: device.metadata.name });
                                                            container.env.push({ name: 'LABEL_NAMESPACE', value: namespace });
                                                            Object.keys(device.metadata.labels).forEach(key => {
                                                                container.env.push({
                                                                    name: 'LABEL_'+key.toLocaleUpperCase(),
                                                                    value: device.metadata.labels[key]
                                                                });
                                                            })
                                                        })
                                                    })
                                                } catch (err) {
                                                    node.error(err, msg);
                                                    node.status({fill: "red", shape: "dot", text: err});
                                                }

                                                this.client.apis['kubeflow.org'].v1.namespaces(node.namespace).devices(device.metadata.name).put({body: device})
                                                    .catch(err => {
                                                        // console.log("Update Device Error: ", err);
                                                        node.error(err, msg);
                                                        node.status({fill: "red", shape: "dot", text: err});
                                                    })
                                                // .then(update => {
                                                //     console.log("Update: ", update);
                                                // })
                                            })
                                            node.status({fill: "green", shape: "dot", text: "Updated: \n" + filtered.map(device => device.metadata.name + " \n")});
                                        })
                                        .catch(err => {
                                            // console.log("Get Device Error: ", err);
                                            node.error(err, msg);
                                            node.status({fill: "red", shape: "dot", text: err});
                                        })
                                }
                            }
                        });
                    } else {
                        if (msg.hasOwnProperty("payload")) {
                            payload = msg.payload;
                            target.get(context.key, context.store, (err, current) => {
                                if (err) {
                                    node.error(err, msg);
                                    node.status({fill: "red", shape: "dot", text: err});
                                } else {
                                    if (!current) {
                                        current = [];
                                    }
                                    current.push(payload);
                                    target.set(context.key, current, context.store, function (err) {
                                        if (err) {
                                            node.error(err, msg);
                                            node.status({fill: "red", shape: "dot", text: err});
                                        }
                                    });
                                }
                            });
                        }
                    }
                } catch (err) {
                    node.error(err.message, msg);
                    node.status({fill: "red", shape: "dot", text: err});
                }
            });
        }
    }

    RED.nodes.registerType("configure-device", ConfigureDevice);

    ConfigureDevice.prototype.close = function () {
        if (this.onceTimeout) {
            clearTimeout(this.onceTimeout);
        }

        try {
            var context = RED.util.parseContextStore(this.id);
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

    RED.httpAdmin.get('/node-red-teknoir-configure-devices', function (req, res) {
        client.apis['kubeflow.org'].v1.namespaces(namespace).devices().get()
            .catch(error => res.status(500).send(error))
            .then(devices => {
                deviceList = [];
                devices.body.items.forEach((device) => {
                    deviceList.push({
                        name: device.metadata.name,
                        namespace: device.metadata.namespace,
                        labels: device.metadata.labels
                    });
                })
                res.status(200).json(deviceList);
                // names = [];
                // devices.body.items.forEach((device) => {
                //     names.push(device.metadata.name);
                // })
                // res.status(200).json(names);
            })
    });

}
