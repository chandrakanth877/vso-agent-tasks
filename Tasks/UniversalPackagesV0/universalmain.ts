import * as path from "path";
import * as telemetry from "utility-common/telemetry";
import * as tl from "vsts-task-lib";
import * as artifactToolUtilities from "./Common/ArtifactToolUtilities";
import * as auth from "./Common/Authentication";
import * as universalDownload from "./universaldownload";
import * as universalPublish from "./universalpublish";

async function main(): Promise<void> {
    tl.setResourcePath(path.join(__dirname, "task.json"));

    // Getting artifact tool
    tl.debug("Getting artifact tool");
    let artifactToolPath: string;

    try {
        const localAccessToken = auth.getSystemAccessToken();
        const serviceUri = tl.getEndpointUrl("SYSTEMVSSCONNECTION", false);
        const blobUri = await artifactToolUtilities.getBlobstoreUriFromBaseServiceUri(
            serviceUri,
            localAccessToken);

        // Finding the artifact tool directory
        artifactToolPath = await artifactToolUtilities.getArtifactToolFromService(
            blobUri,
            localAccessToken,
            "artifacttool");
    }
    catch (error) {
        tl.setResult(tl.TaskResult.Failed, error.message);
        return;
    } finally{
        _logUniversalStartupVariables(artifactToolPath);
    }

    // Calling the command. download/publish
    const universalPackageCommand = tl.getInput("command", true);
    switch (universalPackageCommand) {
        case "download":
            universalDownload.run(artifactToolPath);
            break;
        case "publish":
            universalPublish.run(artifactToolPath);
            break;
        default:
            tl.setResult(tl.TaskResult.Failed, tl.loc("Error_CommandNotRecognized", universalPackageCommand));
            break;
    }
}

function _logUniversalStartupVariables(artifactToolPath: string) {
    try {
        let universalPackagesTelemetry = {
            "command": tl.getInput("command"),
            "buildProperties": tl.getInput("buildProperties"),
            "basePath": tl.getInput("basePath"),
            "System.TeamFoundationCollectionUri": tl.getVariable("System.TeamFoundationCollectionUri"),
            "verbosity": tl.getInput("verbosity"),
            "solution": tl.getInput("solution"),
            "artifactToolPath": artifactToolPath,
            };

        telemetry.emitTelemetry("Packaging", "UniversalPackages", universalPackagesTelemetry);
    } catch (err) {
        tl.debug(`Unable to log Universal Packages task init telemetry. Err:( ${err} )`);
    }
}

main();
