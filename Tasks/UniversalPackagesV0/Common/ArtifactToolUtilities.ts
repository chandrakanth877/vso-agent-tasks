// Placed as a separate file for the purpose of unit testing
import AdmZip = require('adm-zip');
import os = require("os");
import * as path from "path";
import * as semver from "semver";
import * as vsts from "vso-node-api";
import * as tl from "vsts-task-lib";
import * as toollib from "vsts-task-tool-lib/tool";

export function getArtifactToolLocation(dirName: string): string {
    let toolPath: string = path.join(dirName, "ArtifactTool.exe");
    if (tl.osType() !== "Windows_NT"){
        toolPath = path.join(dirName, "artifacttool");
    }
    return toolPath;
}

function _createExtractFolder(dest?: string): string {
    if (!dest) {
        // create a temp dir
        dest = path.join(tl.getVariable("Agent.TempDirectory"), "artifactTool");
    }
    tl.mkdirP(dest);
    return dest;
}

export async function extractZip(file: string): Promise<string> {
    if (!file) {
        throw new Error("parameter 'file' is required");
    }
    let dest = _createExtractFolder();
    let zip = new AdmZip(file);
    zip.extractAllTo(dest, true);
    return dest;
}

// Getting service urls from resource areas api
export async function getServiceUriFromAreaId(serviceUri: string, accessToken: string, areaId: string){
    const credentialHandler = vsts.getBasicHandler("vsts", accessToken);
    const connectionData = new vsts.WebApi(serviceUri, credentialHandler);

    let locationApi = await connectionData.getLocationsApi();

    const serviceUriFromArea = await locationApi.getResourceArea(areaId);

    return serviceUriFromArea.locationUrl;
}

export async function getArtifactToolFromService(serviceUri: string, accessToken: string, toolName: string){

    let osName = tl.osType();
    let arch = os.arch();
    if(osName === "Windows_NT"){
        osName = "windows";
    }
    if (arch === "x64"){
        arch = "amd64";
    }

    const blobstoreAreaName = "clienttools";
    const blobstoreAreaId = "187ec90d-dd1e-4ec6-8c57-937d979261e5";
    const ApiVersion = "5.0-preview";

    const credentialHandler = vsts.getBasicHandler("vsts", accessToken);
    const blobstoreConnection = new vsts.WebApi(serviceUri, credentialHandler);

    try{
        const artifactToolGetUrl = await blobstoreConnection.vsoClient.getVersioningData(ApiVersion,
            blobstoreAreaName, blobstoreAreaId, { toolName }, {osName, arch});

        const artifactToolUri =  await blobstoreConnection.rest.get(artifactToolGetUrl.requestUrl);

        if (artifactToolUri.statusCode !== 200){
            tl.debug(tl.loc("Error_UnexpectedErrorFailedToGetToolMetadata", artifactToolUri.toString()));
            throw new Error(tl.loc("Error_UnexpectedErrorFailedToGetToolMetadata", artifactToolGetUrl.requestUrl));
        }

        let artifactToolPath = toollib.findLocalTool(toolName, artifactToolUri.result.version);
        if (!artifactToolPath) {
            tl.debug(tl.loc("Info_DownloadingArtifactTool", artifactToolUri.result.uri));

            const zippedToolsDir: string = await toollib.downloadTool(artifactToolUri.result.uri);
            
            tl.debug("Downloaded zipped artifact tool to " + zippedToolsDir);
            const unzippedToolsDir = await extractZip(zippedToolsDir);

            artifactToolPath = await toollib.cacheDir(unzippedToolsDir, "ArtifactTool", artifactToolUri.result.version);
        }
        else{
            tl.debug(tl.loc("Info_ResolvedToolFromCache", artifactToolPath));
        }
        return getArtifactToolLocation(artifactToolPath);
    }
    catch(err){
        tl.error(err);
        tl.setResult(tl.TaskResult.Failed, tl.loc("FailedToGetArtifactTool", err));
    }
}

export function getVersionUtility(versionRadio: string, highestVersion: string): string {
    switch(versionRadio) {
        case "patch":
            return semver.inc(highestVersion, "patch");
        case "minor":
            return semver.inc(highestVersion, "minor");
        case "major":
            return semver.inc(highestVersion, "major");
        default:
            return null;
    }
}

// Feeds url from location service
export async function getFeedUriFromBaseServiceUri(serviceUri: string, accesstoken: string): Promise<string>{
    const feedAreaId = "7ab4e64e-c4d8-4f50-ae73-5ef2e21642a5";

    return getServiceUriFromAreaId(serviceUri, accesstoken, feedAreaId);
}

export async function getBlobstoreUriFromBaseServiceUri(serviceUri: string, accesstoken: string): Promise<string>{
    const blobAreaId = "5294ef93-12a1-4d13-8671-9d9d014072c8";

    return getServiceUriFromAreaId(serviceUri, accesstoken, blobAreaId);
}

export async function getPackageNameFromId(serviceUri: string, accessToken: string, feedId: string, packageId: string): Promise<string> {
    const ApiVersion = "3.0-preview.1";
    const PackagingAreaName = "Packaging";
    const PackageAreaId = "7a20d846-c929-4acc-9ea2-0d5a7df1b197";

    const credentialHandler = vsts.getBasicHandler("vsts", accessToken);
    const feedConnection = new vsts.WebApi(serviceUri, credentialHandler);

    // Getting url for feeds version API
    const packageUrl = await new Promise<string>((resolve, reject) => {
        let getVersioningDataPromise = feedConnection.vsoClient.getVersioningData(ApiVersion, PackagingAreaName, PackageAreaId, { feedId, packageId });
        getVersioningDataPromise.then((result) => {
            return resolve(result.requestUrl);
        });
        getVersioningDataPromise.catch((error) => {
            return reject(error);
        });
    });

    // Return the user input incase of failure
    try{
        const response = await feedConnection.rest.get(packageUrl);
        if(response.statusCode === 200 && response.result.name){
            return response.result.name;
        }
        return packageId;
    }
    catch(err){
        return packageId;
    }
}

export async function getHighestPackageVersionFromFeed(serviceUri: string, accessToken: string, feedId: string, packageName: string): Promise<string> {
    const ApiVersion = "3.0-preview.1";
    const PackagingAreaName = "Packaging";
    const PackageAreaId = "7a20d846-c929-4acc-9ea2-0d5a7df1b197";

    const credentialHandler = vsts.getBasicHandler("vsts", accessToken);
    const feedConnection = new vsts.WebApi(serviceUri, credentialHandler);

    // Getting url for feeds version API
    const packageUrl = await new Promise<string>((resolve, reject) => {
        var getVersioningDataPromise = feedConnection.vsoClient.getVersioningData(ApiVersion, PackagingAreaName, PackageAreaId, { feedId }, {packageNameQuery: packageName, protocolType: "upack", includeDeleted: "true", includeUrls: "false"});
        getVersioningDataPromise.then((result) => {
            return resolve(result.requestUrl);
        });
        getVersioningDataPromise.catch((error) => {
            return reject(error);
        });
    });

    const versionResponse = await new Promise<string>((resolve, reject) => {
        let responsePromise = feedConnection.rest.get(packageUrl);
        responsePromise.then((result) => {
            if (result.result.count === 0){
                return resolve("0.0.0");
            }
            else{
                result.result.value.forEach((element) => {
                    if (element.name === packageName.toLowerCase()){
                        return resolve(element.versions[0].version);
                    }
                });
            }
        });
        responsePromise.catch((error) => {
            return reject(error);
        });
    });

    return versionResponse;
}
