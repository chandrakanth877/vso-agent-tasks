//// <reference path="../../definitions/vsts-task-lib.d.ts" />
/// <reference path="./node_modules/@types/node/index.d.ts" />
import tl = require('vsts-task-lib/task');
import requestPromise = require('request-promise');
import request = require('request');
import trrd = require('./testresultreader');
import trup = require('./testResultsUploader');
import sequential = require('promise-sequential');
import Q = require('q');
var testRunner = tl.getInput('testRunner', true);
var testResultsFiles = tl.getInput('testResultsFiles', true);
var mergeResults = tl.getInput('mergeTestResults');
export var testRunTitle = tl.getInput('testRunTitle');
var tfsProjectName = tl.getInput('tfsProjectName');
var tfsTestPlanName = tl.getInput('tfsTestPlanName');
var tfsConfigurationName = tl.getInput('tfsConfigurationName');
// var platform = tl.getInput('platform');
// var config = tl.getInput('configuration');
var publishRunAttachments = tl.getInput('publishRunAttachments');

//var serverEndpoint = tl.getPathInput('serverEndpoint');
var serverEndpointAuth
var username = tl.getInput('username') ? tl.getInput('username') : '';
var token = tl.getInput('token') ? tl.getInput('token') : '';
var password
var auth
var http_proxy = tl.getInput('http_proxy');
var https_proxy = tl.getInput('https_proxy');
process.env.http_proxy = http_proxy ? http_proxy: "";
process.env.https_proxy = https_proxy ? https_proxy: "";
process.env.HTTP_PROXY = http_proxy ? http_proxy: "";
process.env.HTTPS_PROXY = https_proxy ? https_proxy: "";
console.log('system proxy:');
console.log(process.env.HTTPS_PROXY);
console.log(process.env.HTTP_PROXY);
//else {
tl.debug("Connected Service NOT Found, try to get system OAuth Token");
auth = tl.getEndpointAuthorization("SYSTEMVSSCONNECTION", false);
console.log(tl.getEndpointUrl("SYSTEMVSSCONNECTION", false));
if (auth.scheme === "OAuth") {
    tl.debug("Got auth token");
    password = auth.parameters["AccessToken"];
}
else {
    tl.debug("Could not determine credentials to use!");
}
if (!password) { // one more try to get System.AccessToken if token in the build Options page enabled
    password = tl.getVariable('System.AccessToken');
}

if (!password) {
    tl.debug("The system Oauth token is NOT present");
    let err = "Could not find System.AccessToken. Please enable the token in the build Options page (tick the box 'Allow Scripts to Access OAuth Token').";
    tl.setResult(tl.TaskResult.Failed, err);
    process.exit(1);
}
if (!token) {
    token = password;
}
//}
export var tfsUrl = process.env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI;
var tfsBuildDefinitionName = process.env.BUILD_DEFINITIONNAME;
export var tfsBuildID = process.env.BUILD_BUILDID;
var tfsBuildNumber = process.env.BUILD_BUILDNUMBER;
var machineName = process.env.AGENT_NAME; // TO DO  - fetch the real machine name !!!!!!

tl.debug('testRunner: ' + testRunner);
tl.debug('testResultsFiles: ' + testResultsFiles);
tl.debug('mergeResults: ' + mergeResults);
// tl.debug('platform: ' + platform);
// tl.debug('config: ' + config);
tl.debug('testRunTitle: ' + testRunTitle);
tl.debug('publishRunAttachments: ' + publishRunAttachments);

//=========== Clases =====================================================================================================
export class TestSuite {
    suiteName: string;
    suiteID: string;
    testCases: string[];
    testCasesToAdd: TestCaseToAdd[];
    testPoints: TestPoint[];

}
export class TestPoint {
    testPointID: string;
    testCaseID: string;
}
export class TestCaseToAdd {
    testCaseName: string;
    testCaseID: string;
}
export class PublishData {
    machineName: string;
    testPlanName: string;
    testPlanID: string;
    rootSuiteID: string;
    testRunID: string;
    buildDefinitionSuite: TestSuite;
    buildDefinitionSuites: TestSuite[];
    configurationSuite: TestSuite;
    isNewSuite: boolean;
    tfsConfigurationID: string;
    dictTestResults: Object;   // dict[name] = trrd.TestResultCreateModel[];
    existingTestCaseIDsInSuite: string[];
    dictExistingTestCasesInSuite: Object;   // dict[name]=id
    dictMissingTestCasesInSuite: Object;   // dict[name]=id
    testNamesToPublish: string[]; // this array keeps the test-order during the publish process
    testResults: object;
    //Checkin
    AllTestSuites: string[];
}
//================================================================================================================
function errorHandler(e) {
    console.log("==== ERROR Occurred ===== ");
    var error = JSON.parse(JSON.stringify(e));
    console.log(e.message);
    tl.setResult(tl.TaskResult.Failed, '==== ERROR Occurred =====');
}
//================================================================================================================
export function createOptions(verb, url, body) {

    var options = {
        'uri': tfsUrl + tfsProjectName + '/_apis/' + url,
        'rejectUnauthorized': false,
        'resolveWithFullResponse': true,
        'auth': {
            'user': username,
            'pass': token, //password,
            'sendImmediately': true
        }
    };

    if (verb == 'POST') {
        options['method'] = 'POST';
        options['json'] = true;
        options['headers'] = {};
        options['headers']['Content-Type'] = 'application/json';
        options['body'] = body;
    }
    else if (verb == 'PATCH') {
        options['method'] = 'PATCH';
        options['json'] = false;
        options['headers'] = {};
        options['headers']['Content-Type'] = 'application/json-patch+json';
        options['body'] = body;
    }
    else if (verb == 'PATCH_post') {
        options['method'] = 'PATCH';
        options['json'] = true;
        options['headers'] = {};
        options['headers']['Content-Type'] = 'application/json';
        options['body'] = body;
    }

    return options;
}
export function createWiOptions(verb, url, body) {

    var options = {
        'uri': tfsUrl + '/_apis/' + url,
        'rejectUnauthorized': false,
        'resolveWithFullResponse': true,
        'auth': {
            'user': username,
            'pass': token, //password,
            'sendImmediately': true
        }
    };

    return options;
}
//================================================================================================================
//================================================================================================================
//================================================================================================================
//================================================================================================================
//================================================================================================================

//----------------------------------------------------------------------------------------------------------------
//----------------------------------------------------------------------------------------------------------------

//================================================================================================================
//================================================================================================================

function verifyTestSuiteDefaultConfiguration(httpsResponse, publishData) {

    var res = JSON.parse(JSON.stringify(httpsResponse));
    //console.log(res);

    return publishData
}

//----------------------------------------------------------------------------------------------------------------

function setTestSuiteDefaultConfiguration(publishData: PublishData) {

    if (publishData.isNewSuite == false) {

        return publishData
    }

    var json = { 'inheritDefaultConfigurations': 'false', 'defaultConfigurations': [{ 'id': publishData.tfsConfigurationID }] }
    var url = 'test/plans/' + publishData.testPlanID + '/suites/' + publishData.configurationSuite.suiteID + '?api-version=1.0';

    var options = createOptions('PATCH_post', url, json);

    return requestPromise(options).then((httpsResponse) => { return verifyTestSuiteDefaultConfiguration(httpsResponse, publishData) })
}

//================================================================================================================
//================================================================================================================

function updateTfsConfiguration(httpsResponse, publishData: PublishData): PublishData {

    var res = JSON.parse(JSON.stringify(httpsResponse));
    //console.log(res);
    var id = res.body.id;
    //console.log('extractId -  requested element: ' + publishData.configurationSuite.suiteName + '  id found: ' + id);
    publishData.tfsConfigurationID = id;

    return publishData;
}

//----------------------------------------------------------------------------------------------------------------

function createTfsConfiguration(publishData: PublishData) {

    var configurationName = publishData.configurationSuite.suiteName;

    var json = { 'name': configurationName, 'state': 'Active' };
    var url = 'test/configurations?api-version=3.0-preview';
    var options = createOptions('POST', url, json);

    return requestPromise(options).then((httpsResponse) => { return updateTfsConfiguration(httpsResponse, publishData) })
}
//----------------------------------------------------------------------------------------------------------------

function searchTfsConfiguration(httpsResponse, publishData: PublishData) {

    var res = JSON.parse(httpsResponse.body);
    //console.log(res);

    var configurationName = publishData.configurationSuite.suiteName;

    if (res.value.length > 0) {
        for (var item of res.value) {
            if (item.name == configurationName) {
                console.log("TFS Configuration Found:  " + configurationName + "   id = " + item.id);
                publishData.tfsConfigurationID = item.id;
                return publishData; //return the first match. If more than one ignore the rest.
            }
        }
    }
    //console.log("TFS Configuration NOT Found:  " + configurationName);
    return createTfsConfiguration(publishData);
}

//----------------------------------------------------------------------------------------------------------------

function getTfsConfigurationID(publishData: PublishData) {

    var url = 'test/configurations?api-version=3.0-preview';

    var options = createOptions('GET', url, null);
    return requestPromise(options).then((httpsResponse) => { return searchTfsConfiguration(httpsResponse, publishData) })
}
//================================================================================================================
//================================================================================================================

function updateConfigurationSuiteID(httpsResponse, publishData: PublishData): PublishData {

    var res = JSON.parse(JSON.stringify(httpsResponse));
    var id = res.body.value[0].id;
    console.log('extractId -  requested element: ' + publishData.configurationSuite.suiteName + '  id found: ' + id);
    publishData.configurationSuite.suiteID = id;
    publishData.isNewSuite = true;

    return publishData;
}
//----------------------------------------------------------------------------------------------------------------

function createConfigurationSuite(publishData: PublishData) {

    var configurationSuiteName = publishData.configurationSuite.suiteName;

    var json = { 'suiteType': 'StaticTestSuite', 'name': configurationSuiteName };
    var url = 'test/plans/' + publishData.testPlanID + '/suites/' + publishData.buildDefinitionSuite.suiteID + '?api-version=1.0';
    var options = createOptions('POST', url, json);

    return requestPromise(options).then((httpsResponse) => { return updateConfigurationSuiteID(httpsResponse, publishData) })
}
//----------------------------------------------------------------------------------------------------------------

function searchConfigurationSuite(httpsResponse, publishData: PublishData) {

    var res = JSON.parse(httpsResponse.body);
    console.log('publish data in search config:');
    console.log(res);

    var configurationSuiteName = publishData.configurationSuite.suiteName;

    if (res.suites.length > 0) {
        for (var item of res.suites) {
            if (item.name == configurationSuiteName) {
                console.log("Configuration Suite Found:  " + configurationSuiteName + "   id = " + item.id);
                publishData.configurationSuite.suiteID = item.id;
                publishData.isNewSuite = false;
                return publishData; //return the first match. If more than one ignore the rest.
            }
        }
    }
    console.log("Configuration Suite NOT Found:  " + configurationSuiteName);
    return createConfigurationSuite(publishData);
}

//----------------------------------------------------------------------------------------------------------------

function getConfigurationSuiteID(publishData: PublishData) {

    var url = 'test/plans/' + publishData.testPlanID + '/suites/' + publishData.buildDefinitionSuite.suiteID + '/?&includeChildSuites=true&api-version=1.0';

    var options = createOptions('GET', url, null);

    return requestPromise(options).then((httpsResponse) => { return searchConfigurationSuite(httpsResponse, publishData) })
}
//================================================================================================================
//================================================================================================================

function updateBuildSuiteID(httpsResponse, publishData: PublishData): PublishData {

    var res = JSON.parse(JSON.stringify(httpsResponse));
    var id = res.body.value[0].id;
    console.log('extractId -  requested element: ' + publishData.buildDefinitionSuite.suiteName + '  id found: ' + id);
    publishData.buildDefinitionSuite.suiteID = id;

    return publishData;
}
//----------------------------------------------------------------------------------------------------------------

function createBuildSuite(publishData: PublishData, BuildName) {
    var buildSuiteName = BuildName;

    var json = { 'suiteType': 'StaticTestSuite', 'name': buildSuiteName };
    var url = 'test/plans/' + publishData.testPlanID + '/suites/' + publishData.rootSuiteID + '?api-version=1.0';
    var options = createOptions('POST', url, json);
    return requestPromise(options)
        .then((httpsResponse) => {
            let temp = httpsResponse.body;
            let suite: TestSuite = new TestSuite;
            suite.suiteID = httpsResponse.body.value[0].id;
            suite.suiteName = buildSuiteName;
            return suite;
        })
}

//----------------------------------------------------------------------------------------------------------------

function searchBuildSuite(httpsResponse, publishData: PublishData) {
    console.log(' ');
    console.log("==========  Creating Missing Test Suites  ==========");
    console.log(httpsResponse.body);
    var res = JSON.parse(httpsResponse.body);
    console.log(res.value[0].children);
    var allSuits = publishData.AllTestSuites;
    var rootSuite = res.value[0];
    var rootSuiteID = rootSuite.id;
    var newSuites = [];
    publishData.rootSuiteID = rootSuiteID;
    //rootSuite.children
    var testSuiteName = publishData.buildDefinitionSuite.suiteName;
    var allChildrenDict = {};
    var allChildren = [];
    if (rootSuite.hasOwnProperty('children')) {
        rootSuite.children.forEach(element => {
            allChildrenDict[element.name] = element.id;
            allChildren.push(element.name);
        });
        let tempSuites: TestSuite[] = [];
        for (var item of allSuits) {
            if (allChildren.indexOf(item) >= 0) {
                console.log("Build Suite Found: id = " + item);
                var localIndex = rootSuite.children.indexOf(item);
                let tempSuite: TestSuite = new TestSuite;
                tempSuite.suiteName = item;
                tempSuite.suiteID = allChildrenDict[item];
                tempSuites.push(tempSuite);
            }
            else {
                newSuites.push(item)
            }
        }
        publishData.buildDefinitionSuites = tempSuites;
    }
    else {
        newSuites = allSuits;
    }

    let suites: TestSuite[] = [];
    let i = 0;
    let running = false;
    let intervalTime = 200;
    var deferred = Q.defer();
    //Create new suites, interval is needed so that the creation os the build suites will not collide.
    if (newSuites.length > 0) {
        let timer = setInterval(() => {
            if (running) return;
            running = true;
            createBuildSuite(publishData, newSuites[i]).then((res) => {
                suites.push(res);
                i++;
                if (i > (newSuites.length - 1)) {
                    deferred.resolve(publishData);
                    clearInterval(timer);
                    timer = null;
                }
                publishData.buildDefinitionSuites = suites;
                running = false;
            }).catch((err) => { console.error('Failed on test suit ' + newSuites[i]); console.log(err) });
            //publishData.buildDefinitionSuites = suites;
        }, intervalTime);
    } else {
        deferred.resolve(publishData);
    }
    return deferred.promise.then(() => {
        return publishData;
    });
};

//----------------------------------------------------------------------------------------------------------------

function getBuildSuiteID(publishData: PublishData) {
    console.log("testSuiteName = " + publishData.buildDefinitionSuite.suiteName);
    var url = 'test/plans/' + publishData.testPlanID + '/suites?$asTreeView=true&api-version=1.0';
    var options = createOptions('GET', url, null);
    return requestPromise(options).then((httpsResponse) => {
        return searchBuildSuite(httpsResponse, publishData).then(() => {
            return publishData
        })
    })


}
//================================================================================================================
//================================================================================================================

function updateDefaultConfiguration(publishData: PublishData) {
    let p = [];
    let json = {
        "inheritDefaultConfigurations": false, "defaultConfigurations": [{ "id": publishData.tfsConfigurationID }]
    }
    publishData.buildDefinitionSuites.forEach(suite => {
        let url = 'test/plans/' + publishData.testPlanID + '/suites/' + suite.suiteID + '?api-version=1.0'
        let options = createOptions('PATCH_post', url, json);
        p.push(requestPromise(options).catch((err) => { console.log(err.message) }))
    });

    return Promise.all(p).then(() => {
        return publishData
    })

}

function updateTestPlanID(httpsResponse, publishData: PublishData): PublishData {

    var res = JSON.parse(JSON.stringify(httpsResponse));
    var id = res.body.id;
    publishData.testPlanID = id
    console.log('extractId -  requested element: ' + publishData.testPlanName + '  id found: ' + id);

    return publishData;
}
//----------------------------------------------------------------------------------------------------------------

function createTestPlan(publishData: PublishData) {

    var json = { 'name': publishData.testPlanName };
    var url = 'test/plans?api-version=1.0';
    var options = createOptions('POST', url, json);
    return requestPromise(options).then((httpsResponse) => { return updateTestPlanID(httpsResponse, publishData) })
}

//----------------------------------------------------------------------------------------------------------------

function searchTestPlan(httpsResponse, publishData: PublishData) {
    //HERE
    console.log("===== searchTestPlanName body results  ==========    ");
    console.log(httpsResponse.body);
    var res = JSON.parse(httpsResponse.body);
    console.log(res.value);
    if (res.count > 0) {
        for (var item of res.value) {
            if (item.name == publishData.testPlanName) {
                console.log("test Plan Found:  " + item.name + "   id = " + item.id);
                publishData.testPlanID = item.id;
                return publishData //return the first match. If more than one ignore the rest.
            }
        }
    }
    console.log("test Plan NOT Found:  " + publishData.testPlanName);
    return createTestPlan(publishData);
}

//----------------------------------------------------------------------------------------------------------------

function getTestPlanID(publishData: PublishData) {
    console.log(' ');
    console.log('==========  Getting Test Plan  ==========');
    var url = 'test/plans?api-version=1.0';
    var options = createOptions('GET', url, null);
    console.log(options.uri);
    console.log(JSON.stringify(options));
    return requestPromise(options).then((httpsResponse) => { 
        console.log('response:')
        console.log(httpsResponse)
        return searchTestPlan(httpsResponse, publishData) 
    });
}

//================================================================================================================
//================================================================================================================
//Checkin
function getTestResults(filePath: string, publishData: PublishData) {
    console.log(' ');
    console.log('==========  Getting Test Results From XML  ==========');
    var reader;
    var suiteNames = [];
    publishData.dictTestResults = {};

    if (testRunner == "JUnit") {
        reader = new trrd.JUnitResultReader();
    }
    else if (testRunner == "NUnit") {
        reader = new trrd.NUnitResultReader();
    }
    else if (testRunner == "XUnit") {
        reader = new trrd.XUnitResultReader();
    }

    return reader.readResults(filePath).then((res) => {
        var testSuiteArr = [];
        console.log('trr results are:');
        console.log(res);

        if (testRunner == "JUnit") {
            for (var testResult of res.testResults) {
                publishData.dictTestResults[testResult.automatedTestName] = testResult;
                testSuiteArr.push(testResult.automatedTestStorage);
            }
            console.log(testSuiteArr)
            publishData.AllTestSuites = testSuiteArr.filter((x, i, a) => a.indexOf(x) == i);
        }
        else if (testRunner == "NUnit") {
            for (var testResult of res.testResults) {
                var parsedSuiteName = testResult.automatedTestStorage.split('\\')
                parsedSuiteName = parsedSuiteName[parsedSuiteName.length - 1]
                parsedSuiteName = parsedSuiteName.split('.')[0];
                testResult.automatedTestStorage = parsedSuiteName;
                publishData.dictTestResults[testResult.automatedTestName] = testResult;
                testSuiteArr.push(parsedSuiteName);
            }
            console.log('test Suite Arrey:');
            console.log(testSuiteArr)
            publishData.AllTestSuites = testSuiteArr.filter((x, i, a) => a.indexOf(x) == i);
        }
        else if (testRunner == "XUnit") {

        }
        console.log('publish data test result dictionary:');
        console.log(publishData.dictTestResults);
        return publishData
    });
}


//===================================================
//      check for pattern in testResultsFiles    
//===================================================
if (testResultsFiles.indexOf('*') >= 0 || testResultsFiles.indexOf('?') >= 0) {
    tl.debug('Pattern found in testResultsFiles parameter');
    var buildFolder = tl.getVariable('System.DefaultWorkingDirectory');
    var allFiles = tl.find(buildFolder);
    var matchingTestResultsFiles = tl.match(allFiles, testResultsFiles, null, { matchBase: true });
}
else {
    tl.debug('No pattern found in testResultsFiles parameter');
    var matchingTestResultsFiles = [testResultsFiles];
}

if (!matchingTestResultsFiles || matchingTestResultsFiles.length == 0) {
    tl.warning('No test result files matching ' + testResultsFiles + ' were found.');
    process.exit(0);
}

let running = false;
let i = 0;
let timer = setInterval(() => {
    if (running) return;
    running = true;
    var publishData: PublishData = new PublishData();
    publishData.buildDefinitionSuite = new TestSuite();
    publishData.configurationSuite = new TestSuite();

    publishData.machineName = machineName;
    publishData.testPlanName = tfsTestPlanName;
    publishData.buildDefinitionSuite.suiteName = tfsBuildDefinitionName;
    publishData.configurationSuite.suiteName = tfsConfigurationName;
    getTestResults(matchingTestResultsFiles[i], publishData)
        //.then(() => console.log(0))
        //.then(() => console.log(publishData.testPlanName))
        .then((publishData) => { return getTestPlanID(publishData) })
        //.then((publishData) => console.log(1))
        .then((publishData) => { return getBuildSuiteID(publishData) })

        //.then((publishData) => console.log(2))
        //.then((publishData) => { return getConfigurationSuiteID(publishData) })
        .then((publishData) => { return getTfsConfigurationID(publishData) })
        .then((publishData) => { return updateDefaultConfiguration(publishData) })
        //.then((publishData) => { return setTestSuiteDefaultConfiguration(publishData) })
        .then((publishData) => { return trup.getExistingTestCaseIDsInSuite(publishData) })
        //.then((publishData) => console.log(3))
        //.then((publishData) => { return trup.getExistingTestCaseNamesInSuite(publishData) })
        //.then((publishData) => { return trup.calculatetMissingTestCases(publishData) })
        .then((publishData) => { return trup.createMissingTestCases(publishData) })
        //.then((publishData) => console.log(publishData.buildDefinitionSuites))
        //.then((publishData) => { return trup.addMissingTestCasesToSuite(publishData) })
        .then((publishData) => { return trup.getTestPointsForSuite(publishData) })
        .then((publishData) => { return trup.createTestRun(publishData) })
        .then((publishData) => { return trup.getTestResultsOfTestRun(publishData) })
        .then((publishData) => { return trup.updateTestResultsInTestRun(publishData) })
        .then((publishData) => { return trup.updateTestRunState(publishData) })
        .then((publishData) => {
            console.log(' ');
            console.log('==========  End  ==========');
            console.log(matchingTestResultsFiles[i].split('/')[(matchingTestResultsFiles[i].split('/')).length - 1] + ' Finished Working');
            i++;
            running = false
            if (i > matchingTestResultsFiles.length - 1) {
                clearInterval(timer);
                timer = null;
            }
        })
        .catch(errorHandler);
}, 5000);
