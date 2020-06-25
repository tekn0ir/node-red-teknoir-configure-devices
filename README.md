# node-red-teknoir-configure-devices

A set of nodes that configures devices.

# Install

```
npm install --save node-red-teknoir-configure-devices
```

# Documentation

The nodes are properly documented in `Node-RED` itself. 

The plugin use in-cluster k8s config. In short the nodes will be dynamically created based on k8s deployment discovery. 
Annotations will be used to specify Inputs and Outputs for each node. The IO is based on MQTT topics and parsed JSON objects. 

The actual IO is App specific and you have to refer to each Apps documentation for that.
