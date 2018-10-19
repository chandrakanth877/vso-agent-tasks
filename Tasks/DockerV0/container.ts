"use strict";

import path = require('path');
import * as tl from "vsts-task-lib/task";
import ContainerConnection from "docker-common/containerconnection";
import AuthenticationTokenProvider  from "docker-common/registryauthenticationprovider/authenticationtokenprovider"
import ACRAuthenticationTokenProvider from "docker-common/registryauthenticationprovider/acrauthenticationtokenprovider"
import GenericAuthenticationTokenProvider from "docker-common/registryauthenticationprovider/genericauthenticationtokenprovider"
import Q = require('q');

tl.setResourcePath(path.join(__dirname, 'task.json'));

// Change to any specified working directory
tl.cd(tl.getInput("cwd"));

// get the registry server authentication provider 
var registryType = tl.getInput("containerregistrytype", true);
var authenticationProvider : AuthenticationTokenProvider;

if(registryType ==  "Azure Container Registry"){
    authenticationProvider = new ACRAuthenticationTokenProvider(tl.getInput("azureSubscriptionEndpoint"), tl.getInput("azureContainerRegistry"));
} 
else {
    authenticationProvider = new GenericAuthenticationTokenProvider(tl.getInput("dockerRegistryEndpoint"));
}

var registryAuthenticationToken = authenticationProvider.getAuthenticationToken();

// Connect to any specified container host and/or registry 
var connection = new ContainerConnection();
connection.open(tl.getInput("dockerHostEndpoint"), registryAuthenticationToken);

// Run the specified action
var action = tl.getInput("action", true).toLowerCase();
let command = "";

if(action !== "run a docker command") {
    command = action;
}
else {
    let customCommand = tl.getInput("customCommand", true);

    // sanitize the custom command parameters to log just the action
    let commandTokens = customCommand.split(" ");
    if(commandTokens.length > 0) {
        for(let index = 0; index < commandTokens.length; index ++) {
            // Stop reading tokens when we see any that starts with a special character
            if(/^[a-z0-9A-Z]/i.test(commandTokens[index])) {
                command = command + commandTokens[index] + " ";
            }
            else{
                break;
            }
        }
        command = command.trim();
    }
    else {
        command = "run a docker command"
    }
}

var result = "";
var telemetry = {
    registryType: registryType,
    command: command
};

console.log("##vso[telemetry.publish area=%s;feature=%s]%s",
    "TaskEndpointId",
    "DockerV0",
    JSON.stringify(telemetry));

/* tslint:disable:no-var-requires */
require({
    "build an image": "./containerbuild",
    "tag images": "./containertag",
    "push an image": "./containerpush",
    "push images": "./containerpush",
    "run an image": "./containerrun",
    "run a docker command": "./containercommand"
}[action]).run(connection, (data) => result += data)
/* tslint:enable:no-var-requires */
.fin(function cleanup() {
    connection.close();
})
.then(function success() {
    tl.setVariable("DockerOutput", result);
    tl.setResult(tl.TaskResult.Succeeded, "");
}, function failure(err) {
    tl.setResult(tl.TaskResult.Failed, err.message);
})
.done();