
"use strict";

import fs          = require('fs-extra');
import path        = require("path");
import xmlreader   = require('xmlreader');

	export interface ShallowReference {
	    id: string;
	    name: string;
	    url: string;
	}

	interface CustomTestField {
	    fieldName: string;
	    value: any;
	}

	export interface TestResultCreateModel {
	    area: ShallowReference;
	    associatedWorkItems: number[];
	    automatedTestId: string;
	    automatedTestName: string;
	    automatedTestStorage: string;
	    automatedTestType: string;
	    automatedTestTypeId: string;
	    comment: string;
	    completedDate: string;
	    computerName: string;
	    configuration: ShallowReference;
	    customFields: CustomTestField[];
	    durationInMs: string;
	    errorMessage: string;
	    failureType: string;
	    outcome: string;
	    //owner: VSSInterfaces.IdentityRef;
	    resolutionState: string;
	    //runBy: VSSInterfaces.IdentityRef;
	    stackTrace: string;
	    startedDate: string;
	    state: string;
	    testCase: ShallowReference;
	    testCasePriority: string;
	    testCaseTitle: string;
	    testPoint: ShallowReference;
	}

interface TestRunWithResults {
    testResults: TestResultCreateModel[];
}

interface IResultReader {
    // Reads a test results file from disk  
    readResults(filePath: string) ;
}

export class JUnitResultReader implements IResultReader {

    public readResults(file: string): Promise<TestRunWithResults> {
        return new ResultReader("junit").readResults(file);
    }

}

export class NUnitResultReader implements IResultReader {

    public readResults(file: string): Promise<TestRunWithResults>{
        return new ResultReader("nunit").readResults(file);
    }

}

export class XUnitResultReader implements IResultReader {

    public readResults(file: string): Promise<TestRunWithResults>{
        return new ResultReader("xunit").readResults(file);
    }

}

export class TestSuiteSummary {
    name: string;
    host: string;
    timeStamp: Date;
    duration: number;
    results: TestResultCreateModel[];

    constructor() {
        this.name = "JUnit";
        this.host = "";
        this.timeStamp = new Date();
        this.duration = 0;
        this.results = [];
    }

    addResults(res) {
        this.results = this.results.concat(res);
    }
}


function readFileContents(filePath: string, encoding: string):Promise<string>{
    
    var promise = new Promise(function(resolve,reject){
        fs.readFile(filePath, encoding, (err, data) => {
            if (err) {
                reject(new Error('Could not read file (' + filePath + '): ' + err.message));
            }
            else {
                resolve(data);
             }
        });
    })

    return promise;
}



export class ResultReader {

    constructor(readerType: string) {
        this.type = readerType;
    }

    private type: string;

    public readResults(file: string): Promise<TestRunWithResults>{
        
        var _this = this;
        var promise = new Promise(function(resolve,reject){
        readFileContents(file, "utf-8").then(function (contents) {
            var xmlContents = contents.replace("\ufeff", ""); //replace BOM if exists to avoid xml read error
            return _this.readTestRunData(xmlContents, file);
        }).then(function (testRun) {
            resolve(testRun);
        }).catch(function (err) {
            reject(err);
        });
        })

        return promise;
    }

    private readTestRunData(contents: string, file: string): Promise<TestRunWithResults>{
        
        var testRun2: TestRunWithResults;
        var _this = this;

        var promise = new Promise(function(resolve,reject){
            xmlreader.read(contents, function (err, res) {
                if (err) {
                    reject(err);
                }
                else {
                    try {
                        testRun2 = _this.parseXml(res, file);
                        resolve(testRun2);
                    }
                    catch (ex) {
                        reject(ex);
                    }
               }
            });
        })

        return promise;
    }

    private parseXml(res, file) {
        if (this.type == "junit") {
            return this.parseJUnitXml(res, file);
        }
        else if (this.type == "nunit") {
            return this.parseNUnitXml(res);
        }
        else if (this.type == "xunit") {
            return this.parseXUnitXml(res);
        }
        else {
            return null;
        }
    }

    private parseJUnitXml(res, file) {

        var testRun2: TestRunWithResults;
        var fileName;
        
        //Getting the file name for naming the test run
        if (file && 0 !== file.length) {
            // This handles both windows and mac os file formats to extract the file name
            fileName = file.split('\\').pop().split('/').pop();
        }
        

        //init test run summary - runname, host, start time, run duration
        var runSummary = new TestSuiteSummary();

        if (res.testsuites) {
            var testSuitesNode = res.testsuites.at(0);
        }

        if (testSuitesNode) {
            if (testSuitesNode.testsuite) {
                var numTestSuites = testSuitesNode.testsuite.count();

                for (var n = 0; n < numTestSuites; n++) {
                    var testSuiteSummary = this.readTestSuiteJUnitXml(testSuitesNode.testsuite.at(n), fileName);
                    runSummary.duration += testSuiteSummary.duration;
                    runSummary.addResults(testSuiteSummary.results);
                    runSummary.host = testSuiteSummary.host;
                    runSummary.name = testSuiteSummary.name;

                    if (runSummary.timeStamp > testSuiteSummary.timeStamp) {
                        runSummary.timeStamp = testSuiteSummary.timeStamp; //use earlier Date for run start time
                    }
                }

                if (1) {
                    if (numTestSuites > 1) {
                        runSummary.name = this.runTitleJunit(fileName);
                    }
                }
            }
        }
        else {
            if (res.testsuite) {
                var testSuiteNode = res.testsuite.at(0);
            }
            if (testSuiteNode) {
                runSummary = this.readTestSuiteJUnitXml(testSuiteNode, fileName);
            }
        }

        var completedDate = runSummary.timeStamp;
        completedDate.setSeconds(runSummary.timeStamp.getSeconds() + runSummary.duration);


        testRun2 = <TestRunWithResults>{
            testResults: runSummary.results,
        };
        return testRun2;
    }

    private readTestSuiteJUnitXml(rootNode, fileName) {
        var testSuiteSummary = new TestSuiteSummary();
        var totalRunDuration = 0;
        var totalTestCaseDuration = 0;
        
        function extractTestResult(testCaseNode): TestResultCreateModel {
            function pickFirst(type: string) {
                if (!testCaseNode.hasOwnProperty(type)) {
                    throw new Error("Cannot pick first element of type " + type);
                } else if (testCaseNode[type].count() > 1) {
                    if (this.command) {                        
                        this.command.info("Multiple " + type + "s in the test case: " + testName + ". Picking the first for publishing!");
                    }
                    return testCaseNode[type].at(0);
                } else {
                    return testCaseNode[type];
                }                
            }
                        
            //testcase name and type
            var testName = "";
            if (testCaseNode.attributes().name) {
                testName = testCaseNode.attributes().name;
            }

            var testStorage = "";
            if (testCaseNode.attributes().classname) {
                testStorage = testCaseNode.attributes().classname;
            }

            //testcase duration
            var testCaseDuration = 0; //in seconds
            if (testCaseNode.attributes().time) {
                testCaseDuration = parseFloat(testCaseNode.attributes().time);
                totalTestCaseDuration += testCaseDuration;
            }
            
            //testcase outcome
            var outcome = "Passed";
            var errorMessage = "";
            var stackTrace = "";
            if (testCaseNode.failure) {
                outcome = "Failed";
                var testNode = pickFirst.call(this, 'failure');
                if (testNode.text) {
                    stackTrace = testNode.text();
                }
                if (testNode.attributes().message) {
                    errorMessage = testNode.attributes().message;
                }
            }
            else if (testCaseNode.error) {
                outcome = "Failed";
                var testNode = pickFirst.call(this, 'error');
                if (testNode.text) {
                    stackTrace = testNode.text();
                }
                if (testNode.attributes().message) {
                    errorMessage = testNode.attributes().message;
                }
            }
            else if (testCaseNode.skipped || testCaseNode.attributes().status == "notrun") {
                outcome = "NotExecuted";
                errorMessage = "Disabled";//testCaseNode.skipped.text();
            }

            return <TestResultCreateModel>{
                state: "Completed",
                computerName: testSuiteSummary.host,
                testCasePriority: "1",
                automatedTestName: testName,
                automatedTestStorage: testStorage,
                automatedTestType: "JUnit",
                testCaseTitle: testName,
                outcome: outcome,
                errorMessage: errorMessage,
                durationInMs: "" + Math.round(testCaseDuration * 1000), //convert to milliseconds and round to nearest whole number since server can't handle decimals for test case duration
                stackTrace: stackTrace
            };
        }


        if (rootNode.attributes().name) {
            testSuiteSummary.name = rootNode.attributes().name;
        }
        else {
            testSuiteSummary.name = this.runTitleJunit(fileName);
        }

        if (rootNode.attributes().hostname) {
            testSuiteSummary.host = rootNode.attributes().hostname;
        }

        //assume runtimes from xml are current local time since timezone information is not in the xml. If xml date > current local date, fall back to local
        if (rootNode.attributes().timestamp) {
            var timestampFromXml = new Date(rootNode.attributes().timestamp);
            if (timestampFromXml < new Date()) {
                testSuiteSummary.timeStamp = timestampFromXml;
            }
        }

        if (rootNode.attributes().time) {
            totalRunDuration = parseFloat(rootNode.attributes().time); //in seconds
        }
        
        //find test case nodes in JUnit result xml
        var testResults = [];

        if (rootNode.testcase) {
            for (var i = 0; i < rootNode.testcase.count(); i++) {
                var testCaseNode = rootNode.testcase.at(i);
                testResults.push(extractTestResult.call(this, testCaseNode));
            }
        }

        if (totalRunDuration < totalTestCaseDuration) {
            totalRunDuration = totalTestCaseDuration; //run duration may not be set in the xml, so use the testcase duration
        }
        testSuiteSummary.duration = totalRunDuration;
        testSuiteSummary.addResults(testResults);
        return testSuiteSummary;
    }

    private parseNUnitXml(res) {
        var testRun2: TestRunWithResults;

        var runTitle = '';
        
        //read test run summary - runname, host, start time, run duration
        var runStartTime = new Date();
        var totalRunDuration = 0;

        var rootNode = res["test-results"].at(0);
        if (rootNode) {

            var dateFromXml = new Date();
            if (rootNode.attributes().date) {
                dateFromXml = rootNode.attributes().date;
            }

            var timeFromXml = "00:00:00";
            if (rootNode.attributes().time) {
                timeFromXml = rootNode.attributes().time;
            }

            var dateTimeFromXml = new Date(dateFromXml + "T" + timeFromXml);
            if (dateTimeFromXml < new Date()) {
                runStartTime = dateTimeFromXml;
            }
        }

        //run environment - platform, config, hostname
        var runUser = "";
        var hostName = "";
        var platform = "";

        if (rootNode.environment) { var envNode = rootNode.environment.at(0); }

        if (envNode) {

            if (envNode.attributes()["machine-name"]) {
                hostName = envNode.attributes()["machine-name"];
            }

            if (envNode.attributes().platform) {
                platform = envNode.attributes().platform;
            }
        }            

        //get all test cases
        var testResults = [];

        for (var t = 0; t < rootNode["test-suite"].count(); t++) {
            testResults = testResults.concat(this.FindNUnitTestCaseNodes(rootNode["test-suite"].at(t), hostName, rootNode.attributes().name));

            if (rootNode["test-suite"].at(t).attributes().time) {
                totalRunDuration += parseFloat(rootNode["test-suite"].at(t).attributes().time);
            }
        }

        var completedDate = runStartTime;
        completedDate.setSeconds(runStartTime.getSeconds() + totalRunDuration);


        testRun2 = <TestRunWithResults>{
            testResults: testResults,
        };

        return testRun2;
    }

    private FindNUnitTestCaseNodes(startNode, hostName: string, assemblyName: string) {

        var foundTestResults = [];

        var testStorage = assemblyName;
        if (startNode.attributes().type == "Assembly") {
            testStorage = startNode.attributes().name;
        }

        //if test-case node exist, read test case information
        if (startNode.results["test-case"]) {

            for (var i = 0; i < startNode.results["test-case"].count(); i++) {
                var testCaseNode = startNode.results["test-case"].at(i);
                
                //testcase name and type
                var testName = "";
                if (testCaseNode.attributes().name) {
                    testName = testCaseNode.attributes().name;
                }                                                               

                //testcase duration
                var testCaseDuration = 0; //in seconds
                if (testCaseNode.attributes().time) {
                    testCaseDuration = parseFloat(testCaseNode.attributes().time);
                }                            

                //testcase outcome
                var outcome = "Passed";
                var errorMessage = "";
                var stackTrace = "";
                if (testCaseNode.failure) {
                    outcome = "Failed";
                    if (testCaseNode.failure.message && testCaseNode.failure.message.text) {
                        errorMessage = testCaseNode.failure.message.text();
                    }
                    if (testCaseNode.failure["stack-trace"] && testCaseNode.failure["stack-trace"].text) {
                        stackTrace = testCaseNode.failure["stack-trace"].text();
                    }
                }

                var testResult: TestResultCreateModel = <TestResultCreateModel>{
                    state: "Completed",
                    computerName: hostName,
                    testCasePriority: "1",
                    automatedTestName: testName,
                    automatedTestStorage: testStorage,
                    automatedTestType: "NUnit",
                    testCaseTitle: testName,
                    outcome: outcome,
                    errorMessage: errorMessage,
                    durationInMs: "" + Math.round(testCaseDuration * 1000), //convert to milliseconds
                    stackTrace: stackTrace
                };

                foundTestResults.push(testResult);
            }
        }

        if (startNode.results["test-suite"]) {
            for (var j = 0; j < startNode.results["test-suite"].count(); j++) {
                foundTestResults = foundTestResults.concat(this.FindNUnitTestCaseNodes(startNode.results["test-suite"].at(j), hostName, testStorage));
            }
        }

        return foundTestResults;
    }

    private parseXUnitXml(res) {
        var testRun2: TestRunWithResults;

        var buildId, buildRequestedFor, platform, config, runTitle, fileNumber;

        var runName = '';

        var runStartTime = new Date();
        var totalRunDuration = 0;
        var hostName = "";

        var rootNode = res["assemblies"].at(0);
        var testResults = [];

        //Get all test cases.
        for (var t = 0; t < rootNode["assembly"].count(); t++) {
            var assemblyNode = rootNode["assembly"].at(t);
            testResults = testResults.concat(this.FindXUnitTestCaseNodes(assemblyNode, hostName, buildRequestedFor, assemblyNode.attributes().name));
            if (assemblyNode["collection"] && assemblyNode["collection"].attributes().time) {
                totalRunDuration += parseFloat(assemblyNode["collection"].attributes().time);
            }
        }

        var completedDate = runStartTime;
        completedDate.setSeconds(runStartTime.getSeconds() + totalRunDuration);

        testRun2 = <TestRunWithResults>{
            testResults: testResults,
        };

        return testRun2;
    }

    private FindXUnitTestCaseNodes(startNode, hostName: string, buildRequestedFor: string, assemblyName: string) {

        var foundTestResults = [];
        var testStorage = assemblyName;
        
        //If test node(s) exist, read test case information.
        if (startNode.collection["test"]) {

            for (var i = 0; i < startNode.collection["test"].count(); i++) {
                var testNode = startNode.collection["test"].at(i);
                
                //Testcase name.
                var testName = "";
                if (testNode.attributes().name) {
                    testName = testNode.attributes().name;
                }                                                               

                //Fully qualified test name.
                var fullTestName = "";
                if (testNode.attributes().method) {
                    fullTestName = testNode.attributes().method;
                } 

                //Testcase duration in seconds.
                var testCaseDuration = 0;
                if (testNode.attributes().time) {
                    testCaseDuration = parseFloat(testNode.attributes().time);
                }                            

                //Testcase outcome, error message, stack trace.
                var outcome = "Passed";
                var errorMessage = "";
                var stackTrace = "";
                if (testNode.failure) {
                    outcome = "Failed";
                    if (testNode.failure.message && testNode.failure.message.text) {
                        errorMessage = testNode.failure.message.text();
                    }
                    if (testNode.failure["stack-trace"] && testNode.failure["stack-trace"].text) {
                        stackTrace = testNode.failure["stack-trace"].text();
                    }
                }
                else if (testNode.attributes().result && testNode.attributes().result == "Skip") {
                    outcome = "NotExecuted";
                }
                
                //Priority and owner traits.
                var priority;
                var owner;
                if (testNode.traits) {
                    for (var i = 0; i < testNode.traits["trait"].count(); i++) {
                        var traitNode = testNode.traits["trait"].at(i);
                        if (traitNode.attributes().name == "priority") {
                            priority = traitNode.attributes().value;
                        }
                        if (traitNode.attributes().name == "owner") {
                            owner = traitNode.attributes().value;
                        }
                    }
                }

                var testResult = {
                    state: "Completed",
                    computerName: hostName,
                    testCasePriority: priority,
                    automatedTestName: fullTestName,
                    automatedTestStorage: testStorage,
                    owner: owner,
                    runBy: buildRequestedFor,
                    testCaseTitle: testName,
                    revision: 0,
                    outcome: outcome,
                    errorMessage: errorMessage,
                    durationInMs: Math.round(testCaseDuration * 1000), //Convert to milliseconds.
                    stackTrace: stackTrace
                };

                foundTestResults.push(testResult);
            }
        }

        return foundTestResults;
    }

    private runTitleJunit(fileName) {
        var name = "JUnit";

        if (fileName && 0 !== fileName.length) {
            return (name + " " + fileName);
        }

        return name;
    }


    private fileNumberToTitle(runTitle, fileNumber) {
        if (fileNumber > 0) {
            return (runTitle + " " + fileNumber);
        }

        return runTitle;
    }

}