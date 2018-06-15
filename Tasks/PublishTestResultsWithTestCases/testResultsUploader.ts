import { ResultReader, TestSuiteSummary } from './testresultreader';
// The following 'require' declaration creates circular dependency in 'ts', but actually in 'js' there is no problem
import pbtr = require('./publishtestresults');
import trrd = require('./testresultreader');
import Q = require('q');
import requestPromise = require('request-promise');



//================================================================================================================
//================================================================================================================

function verifyTestRunState(httpsResponse, publishData: pbtr.PublishData) {

    var res = JSON.parse(JSON.stringify(httpsResponse));
    //console.log(res)

    // TO DO - verify response

    return publishData;
}

//----------------------------------------------------------------------------------------------------------------


export function updateTestRunState(publishData: pbtr.PublishData) {
//console.log('updateTestRunState');
    var json = { 'completedDate': new Date(), 'state': 'Completed' };

    var url = 'test/runs/' + publishData.testRunID + '?api-version=1.0-preview';

    var options = pbtr.createOptions('PATCH_post', url, json);

    return requestPromise(options).then((httpsResponse) => { return verifyTestRunState(httpsResponse, publishData) })
}

//================================================================================================================
//================================================================================================================

function verifyTestResultsAddedToTestRun(httpsResponse, publishData: pbtr.PublishData) {
    var res = JSON.parse(JSON.stringify(httpsResponse));
    //console.log(res)
    //for(var testResult of res.body.value){ console.log(testResult)}
    // TO DO - verify response
    return publishData;
}

//----------------------------------------------------------------------------------------------------------------

function createJsonWithTestResults(publishData: pbtr.PublishData) {

    var json = [];
    var index = 0;
    let testNames = [];
    publishData.buildDefinitionSuites.forEach(suite => {
        if (suite.testCases && suite.testCases.length > 0) {
            suite.testCases.forEach(element => {
                testNames.push(element)
            });
        }
        if (suite.testCasesToAdd && suite.testCasesToAdd.length > 0) {
            suite.testCasesToAdd.forEach(element => {
                testNames.push(element.testCaseName)
            });
        }
    });
    testNames = testNames.filter(function (elem, pos) {
        return testNames.indexOf(elem) == pos;
    });
    for (var testName of testNames) {
        var testResult: trrd.TestResultCreateModel = publishData.dictTestResults[testName];
        //console.log(testResult);
        if (testResult != undefined) {
            console.log('Test name: ' + testResult.automatedTestName + ' ,Outcome: ' + testResult.outcome);
            var item = {};
            item['testResult'] = { 'id': publishData.testResults[testName] }
            item['outcome'] = testResult.outcome;
            item['failureType'] = testResult.failureType;
            item['errorMessage'] = testResult.errorMessage;
            item['computerName'] = publishData.machineName;

            var startedDate = new Date();
            item['startedDate'] = startedDate;

            var completedDate = new Date();
            completedDate.setTime(startedDate.getTime() + parseInt(testResult.durationInMs));
            item['completedDate'] = completedDate.toJSON();

            item['state'] = 'Completed';

            json.push(item)

            index++;
        }
    }
    return json
}

//----------------------------------------------------------------------------------------------------------------

export function updateTestResultsInTestRun(publishData: pbtr.PublishData) {
    console.log(' ');
    console.log('==========  Updating Test Results  ==========');


    var testResults = publishData.dictTestResults;
    if (Object.keys(testResults).length > 0) {
        var url = 'test/runs/' + publishData.testRunID + '/results?api-version=2.0';
        var json = createJsonWithTestResults(publishData);
        var options = pbtr.createOptions('PATCH_post', url, json);
        return requestPromise(options).then((httpsResponse) => { return verifyTestResultsAddedToTestRun(httpsResponse, publishData) })
    }
    else {
        return publishData
    }
}
//================================================================================================================
//================================================================================================================

function extractTestResultIDsOfTestRun(httpsResponse, publishData: pbtr.PublishData) {

    var res = JSON.parse(httpsResponse.body);
    //console.log(res)

    publishData.testResults = {};

    for (var result of res.value) {
        publishData.testResults[result.testCase.name] = (result.id)
    }
    return publishData
}

//----------------------------------------------------------------------------------------------------------------

export function getTestResultsOfTestRun(publishData: pbtr.PublishData) {

    //console.log('Get Test Results Of Test Run');

    var url = 'test/runs/' + publishData.testRunID + '/results?api-version=3.0-preview';
    var options = pbtr.createOptions('GET', url, null);

    return requestPromise(options).then((httpsResponse) => { return extractTestResultIDsOfTestRun(httpsResponse, publishData) })

}

//================================================================================================================
//================================================================================================================

function updateTestRunID(httpsResponse, publishData: pbtr.PublishData): pbtr.PublishData {

    var res = JSON.parse(JSON.stringify(httpsResponse));
    var id = res.body.id;
    console.log('New Test Run ID: ' + id);
    publishData.testRunID = id;

    return publishData;
}

//----------------------------------------------------------------------------------------------------------------

export function createTestRun(publishData: pbtr.PublishData) {
    console.log(' ');
    console.log('==========  Creating Test Run  ==========');
    var testPointIDs = [];

    publishData.buildDefinitionSuites.forEach(suite => {
        suite.testPoints.forEach(point => {
            testPointIDs.push(point.testPointID);
        });
    });

    var json = {
        'name': pbtr.testRunTitle,
        'build': { 'id': pbtr.tfsBuildID },
        'plan': { 'id': publishData.testPlanID },
        'configIds': [publishData.tfsConfigurationID],
        'pointIds': testPointIDs
    };

    var url = 'test/runs?api-version=1.0-preview';

    var options = pbtr.createOptions('POST', url, json);

    return requestPromise(options).then((httpsResponse) => { return updateTestRunID(httpsResponse, publishData) })
}

//================================================================================================================
//================================================================================================================

function exstractTestPoints(httpsResponse, publishData: pbtr.PublishData) {

    var res = JSON.parse(httpsResponse.body);
    //console.log(res)
    console.log('Update test point in test results')

    var dictTestPointVsTestCase = {};

    for (var testPoint of res.value) {
        //console.log(item);
        dictTestPointVsTestCase[testPoint.testCase.id] = testPoint.id;
    }

    publishData.testNamesToPublish = [];

    for (var testName of Object.keys(publishData.dictTestResults)) {

        var testResult: trrd.TestResultCreateModel = publishData.dictTestResults[testName];

        publishData.dictTestResults[testName].testPoint = {};
        publishData.dictTestResults[testName].testPoint.id = dictTestPointVsTestCase[testResult.testCase.id];
        publishData.testNamesToPublish.push(testName); //determine the test publish order for the next steps
    }

    return publishData;
}

//----------------------------------------------------------------------------------------------------------------

export function getTestPointsForSuite(publishData: pbtr.PublishData) {
    console.log(' ');
    console.log('==========  Geting Test Points  ==========');
    var p = [];
    publishData.buildDefinitionSuites.forEach(suite => {
        let testPoints: pbtr.TestPoint[] = [];
        var url = 'test/plans/' + publishData.testPlanID + '/suites/' + suite.suiteID + '/points?api-version=1.0';
        var options = pbtr.createOptions('GET', url, null);
        p.push(requestPromise(options).then((testPointsResults) => {
            testPointsResults = JSON.parse(testPointsResults.body);
            console.log('Test Suite Name: ' + suite.suiteName);
            //console.log(testPointsResults.value);
            testPointsResults.value.forEach(point => {
                let tp: pbtr.TestPoint = new pbtr.TestPoint;
                console.log('TestPoint ID: ' + point.id + ' TestCase ID: ' + point.testCase.id);
                tp.testPointID = point.id;
                tp.testCaseID = point.testCase.id;
                testPoints.push(tp)
            });
        }));
        Promise.all(p).then(() => {
            suite.testPoints = testPoints;
        })
    });

    return Promise.all(p).then(() => {
        return publishData;
    });
    // var url = 'test/plans/' + publishData.testPlanID + '/suites/' + publishData.configurationSuite.suiteID + '/points?api-version=1.0';
    // var options = pbtr.createOptions('GET', url, null);

    //return requestPromise(options).then((httpsResponse) => { return exstractTestPoints(httpsResponse, publishData) })
};

//================================================================================================================
//================================================================================================================

function verifyTestCasesAddedToSuite(httpsResponse, publishData: pbtr.PublishData) {

    var res = JSON.parse(JSON.stringify(httpsResponse));
    //console.log(res)
    // TO DO - verify response
    var array = [];
    return array;
}

//----------------------------------------------------------------------------------------------------------------

export function addMissingTestCasesToSuite(publishData: pbtr.PublishData) {

    console.log('Add Missing Test Cases To Suite');

    var missingTestCaseNamesInSuite = Object.keys(publishData.dictMissingTestCasesInSuite);
    var promise = Promise.resolve();

    if (missingTestCaseNamesInSuite.length <= 0) {
        return promise.then(() => { return publishData });
    }

    var missingTestCaseIDsInSuite = missingTestCaseNamesInSuite.map((key) => { return publishData.dictMissingTestCasesInSuite[key] });

    var handledTestCases = 0;
    var limitTestCasesInUri = 20;


    function createRequestPromise() {

        var numTestCasesInThisRequest = Math.min(missingTestCaseIDsInSuite.length - handledTestCases, limitTestCasesInUri)
        var url =
            'test/plans/' + publishData.testPlanID
            + '/suites/' + publishData.configurationSuite.suiteID
            + '/testcases/' + missingTestCaseIDsInSuite.slice(handledTestCases, handledTestCases + numTestCasesInThisRequest).join()
            + '?api-version=1.0';

        var options = pbtr.createOptions('POST', url, null);
        var p = requestPromise(options).then((httpsResponse) => { return verifyTestCasesAddedToSuite(httpsResponse, publishData) });

        handledTestCases = handledTestCases + numTestCasesInThisRequest;

        return p;
    }

    for (var j = 0; j < missingTestCaseIDsInSuite.length; j = j + limitTestCasesInUri) {
        promise = promise.then(() => { return createRequestPromise() })
    }

    return promise.then(() => { return publishData });
}

//================================================================================================================
//================================================================================================================

function exstractTestCaseID(httpsResponse, testCaseName) {

    var res = JSON.parse(JSON.stringify(httpsResponse));
    //console.log(res)

    var body = JSON.parse(res.body);

    return { 'testCaseName': testCaseName, 'testCaseID': body.id }
}

//----------------------------------------------------------------------------------------------------------------

function createTestCaseWorkItem(testCaseName) {

    var json = "[{'op':'add', 'path': '/fields/System.Title', 'value':'" + testCaseName + "'}]";
    //console.log(json);

    var url = 'wit/workitems/$Test%20Case?api-version=1.0';

    var options = pbtr.createOptions('PATCH', url, json);

    return requestPromise(options).then((httpsResponse) => { return exstractTestCaseID(httpsResponse, testCaseName).testCaseID })
}

//----------------------------------------------------------------------------------------------------------------

export function createMissingTestCases(publishData: pbtr.PublishData) {
    let p = [];
    let counter = 0;
    var deferred = Q.defer();
    let testCasesArr: pbtr.TestCaseToAdd[]
    //console.log(publishData.buildDefinitionSuites);
    console.log(' ');
    console.log('==========  Creating Missing Test Cases  ==========');
    if (publishData.buildDefinitionSuites != undefined) {
        //console.log(Object.keys(publishData.dictTestResults))
        publishData.buildDefinitionSuites.forEach(suite => {
            p.push(addCasesToPublishData(publishData, suite).then((res) => {
                if (suite.testCasesToAdd.length > 0) {
                    addTestCasesToSuite(publishData, suite).then(() => {
                        counter++;
                        if (counter == publishData.buildDefinitionSuites.length) {
                            deferred.resolve(publishData);
                        }
                    })
                }
                else {
                    console.log('No new test cases');
                    deferred.resolve(publishData);
                };
            }).catch(() => {
                deferred.resolve(publishData);
            }));
        });
    };
    return Promise.all(p).then(() => {
        return deferred.promise.then(() => {
            return publishData;
        })
    });
};

function addCasesToPublishData(publishData: pbtr.PublishData, suite: pbtr.TestSuite) {
    let testResultsArr = []
    Object.keys(publishData.dictTestResults).forEach(element => {
        if (publishData.dictTestResults[element].automatedTestStorage == suite.suiteName) {
            if (suite.testCases == undefined) {
                testResultsArr.push(element)
            }
            else if (suite.testCases.indexOf(element) == -1) {
                testResultsArr.push(element)
            };
        };
    });

    let testCasesArr: pbtr.TestCaseToAdd[] = []
    let running = false;
    let i = 0;
    let innerDeferred = Q.defer();
    if (testResultsArr.length == 0) {
        innerDeferred.resolve(true)
        return innerDeferred.promise.then(() => {
            return publishData;
        });
    };
    let timer = setInterval(() => {
        if (running) return;
        running = true;
        if (suite.suiteName == publishData.dictTestResults[testResultsArr[i]].automatedTestStorage) {
            if (suite.testCases != undefined && suite.testCases.indexOf(testResultsArr[i]) >= 0) {
                running = false;
                console.log(testResultsArr[i] + ' Exists')
                if (i > testResultsArr.length - 1) {
                    clearInterval(timer);
                    timer = null;
                    innerDeferred.resolve(true);
                }
            }
            else {
                let newCase: pbtr.TestCaseToAdd = new pbtr.TestCaseToAdd;
                newCase.testCaseID = '';
                newCase.testCaseName = testResultsArr[i];
                createTestCaseWorkItem(testResultsArr[i]).then((res) => {
                    i++;
                    newCase.testCaseID = res;
                    console.log(newCase.testCaseName + ' ' + newCase.testCaseID)
                    testCasesArr.push(newCase);
                    if (i > testResultsArr.length - 1) {
                        innerDeferred.resolve(suite);
                        clearInterval(timer);
                        timer = null;
                        suite.testCasesToAdd = testCasesArr;
                    }
                    running = false;
                }).catch((err) => {
                    timer = null;
                    console.log(err.message);
                    innerDeferred.resolve(true);
                });
            };
        };
    }, 20);
    return innerDeferred.promise.then(() => { return suite })
}

function* returnPromises(publishData: pbtr.PublishData, suite: pbtr.TestSuite) {

    let running = false;
    let counter = 0;
    var deferred = Q.defer();


    for (let j = 0; j < suite.testCasesToAdd.length;) {
        let localCases = '';
        for (let i = 0; j < suite.testCasesToAdd.length && i < 20; i++) {
            //console.log(j + ' ' + suite.testCasesToAdd[j].testCaseID + ' ' + suite.testCasesToAdd[j].testCaseName)
            localCases += suite.testCasesToAdd[j].testCaseID + ',';
            j++;
        }
        localCases = localCases.slice(0, -1);
        var url =
            'test/plans/' + publishData.testPlanID
            + '/suites/' + suite.suiteID
            + '/testcases/' + localCases
            + '?api-version=1.0';
        var options = pbtr.createOptions('POST', url, null);
        yield requestPromise(options)
    }
}
export function addTestCasesToSuite(publishData: pbtr.PublishData, suite: pbtr.TestSuite) {
    var promiser = returnPromises(publishData, suite);
    let deferred = Q.defer();
    var running = false;
    var i = 0;
    let timer = setInterval(() => {
        if (running) return;
        running = true;
        promiser.next().value.then((res) => {
            i++
            if (i > (suite.testCasesToAdd.length / 20)) {
                deferred.resolve(true);
                clearInterval(timer);
                timer = null;
            }
            running = false;
        }).catch((err) => {
            console.log(err)
            clearInterval(timer);
            timer = null;
        });
    }, 50);

    return deferred.promise;
}


function sleep(time) {
    return new Promise((resolve) => setTimeout(resolve, time));
}

//================================================================================================================
//================================================================================================================

export function calculatetMissingTestCases(publishData: pbtr.PublishData) {

    //console.log(publishData.dictExistingTestCasesInSuite);

    publishData.dictMissingTestCasesInSuite = {};

    // Scan all test results
    for (var testName of Object.keys(publishData.dictTestResults)) {

        if (publishData.dictExistingTestCasesInSuite.hasOwnProperty(testName)) {

            publishData.dictTestResults[testName].testCase = {};
            publishData.dictTestResults[testName].testCase.name = testName;
            publishData.dictTestResults[testName].testCase.id = publishData.dictExistingTestCasesInSuite[testName];
        }
        else {
            publishData.dictMissingTestCasesInSuite[testName] = '';
        }
    }

    return publishData;
}
//================================================================================================================
//================================================================================================================

function exstractTestNames(httpsResponse, publishData: pbtr.PublishData) {

    var res = JSON.parse(httpsResponse.body);
    //console.log(res)

    for (var item of res.value) {
        //console.log(item.fields['System.Title']);
        publishData.dictExistingTestCasesInSuite[item.fields['System.Title']] = item.id;
    }

    return publishData;
}

//----------------------------------------------------------------------------------------------------------------

export function getExistingTestCaseNamesInSuite(publishData: pbtr.PublishData) {

    console.log('Get Existing TestCase Names In Suite');

    var existingTestCasesIDsInSuite = publishData.existingTestCaseIDsInSuite;

    publishData.dictExistingTestCasesInSuite = {};
    var promise = Promise.resolve();

    if (existingTestCasesIDsInSuite.length <= 0) {
        return promise.then(() => { return publishData });
    }

    var handledTestCases = 0;
    var limitTestCaseIDsInUri = 100;

    function createRequestPromise() {

        var numTestCaseIDsInThisRequest = Math.min(existingTestCasesIDsInSuite.length - handledTestCases, limitTestCaseIDsInUri);

        var url = '';
        var options = pbtr.createOptions('GET', url, null);
        options.uri = pbtr.tfsUrl + '_apis/wit/workitems?ids=' + existingTestCasesIDsInSuite.slice(handledTestCases, handledTestCases + numTestCaseIDsInThisRequest).join() + '&api-version=1.0';

        var p = requestPromise(options).then((httpsResponse) => { return exstractTestNames(httpsResponse, publishData) })

        handledTestCases = handledTestCases + numTestCaseIDsInThisRequest;

        return p;
    }

    for (var j = 0; j < existingTestCasesIDsInSuite.length; j = j + limitTestCaseIDsInUri) {
        promise = promise.then(() => { return createRequestPromise() })
    }

    return promise.then(() => { return publishData });
}

//================================================================================================================
//================================================================================================================

function getTestCaseIDs(httpsResponse, publishData: pbtr.PublishData) {

    var res = JSON.parse(httpsResponse.body);
    //console.log(res)

    var IDs: string[] = [];

    for (var item of res.value) {
        IDs.push(item.testCase.id);
    }

    // publishData.existingTestCaseIDsInSuite = IDs;
    // return publishData

    return IDs
}

//----------------------------------------------------------------------------------------------------------------

export function getExistingTestCaseIDsInSuite(publishData: pbtr.PublishData) {
    let p = []
    if (publishData.buildDefinitionSuites != undefined) {
        publishData.buildDefinitionSuites.forEach(suitId => {
            p.push(getTestCases(publishData, suitId).then((res) => suitId.testCases = res))
        });
    }
    return Promise.all(p).then(() => {
        return publishData
    });

};

//================================================================================================================
//================================================================================================================

export function getExistingTestCasesName(testCaseID) {
    var url = 'wit/workitems?ids=' + testCaseID + '&fields=System.Title&api-version=1.0'
    var options = pbtr.createWiOptions('GET', url, null);
    let result;
    return requestPromise(options)
        .then((httpsResponse) => {
            let response = JSON.parse(httpsResponse.body)
            return response.value[0].fields['System.Title']
        });
};

export function getTestCases(publishData, suitId) {
    var url = 'test/plans/' + publishData.testPlanID + '/suites/' + suitId.suiteID + '/testcases?api-version=1.0';
    var options = pbtr.createOptions('GET', url, null);
    return requestPromise(options)
        .then((httpsResponse) => {
            let response = JSON.parse(httpsResponse.body)
            if (response.count > 0) {
                let p = []
                let testCasesNames = []
                response.value.forEach(testCase => {
                    p.push(getExistingTestCasesName(testCase.testCase.id).then((res) => {
                        testCasesNames.push(res);
                    }));
                });
                return Promise.all(p).then(() => {
                    return testCasesNames;
                });
            };
        });
};