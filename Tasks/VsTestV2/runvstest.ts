import * as tl from 'vsts-task-lib/task';
import * as models from './models';
import * as nondistributedtest from './nondistributedtest';
import * as path from 'path';
import * as distributedTest from './distributedtest';
import * as ci from './cieventlogger';
import * as utils from './helpers';
import * as inputParser from './inputparser';
import * as os from 'os';
const osPlat: string = os.platform();

tl.setResourcePath(path.join(__dirname, 'task.json'));

if (osPlat !== 'win32') {
    // Fail the task if os is not windows
    tl.setResult(tl.TaskResult.Failed, tl.loc('OnlyWindowsOsSupported'));
} else {
    //Starting the VsTest execution
    const taskProps = { state: 'started', result: '' };
    ci.publishEvent(taskProps);

    try {
        utils.Helper.setConsoleCodePage();
        const blockRun = isMultiConfigOnDemandRun();
        if (blockRun) {
            tl.setResult(tl.TaskResult.Failed, tl.loc('MultiConfigNotSupportedWithOnDemand'));
        }
        const serverBasedRun = isServerBasedRun();
        inputParser.setIsServerBasedRun(serverBasedRun);
        if (serverBasedRun) {
            ci.publishEvent({
                runmode: 'distributedtest', parallelism: tl.getVariable('System.ParallelExecutionType'),
                testtype: tl.getInput('testSelector')
            });

            console.log(tl.loc('distributedTestWorkflow'));
            console.log('======================================================');
            const inputDataContract = inputParser.parseInputsForDistributedTestRun();
            console.log('======================================================');

            const test = new distributedTest.DistributedTest(inputDataContract);
            test.runDistributedTest();
        } else {
            ci.publishEvent({ runmode: 'nondistributed' });
            console.log(tl.loc('nonDistributedTestWorkflow'));
            console.log('======================================================');
            const inputDataContract = inputParser.parseInputsForNonDistributedTestRun();
            console.log('======================================================');

            const test = new nondistributedtest.NonDistributedTest(inputDataContract);
            test.runNonDistributedTest();
        }
    } catch (error) {
        tl.setResult(tl.TaskResult.Failed, error);
        taskProps.result = error;
    } finally {
        taskProps.state = 'completed';
        ci.publishEvent(taskProps);
    }
}

function isMultiConfigOnDemandRun(): boolean {
    const testType = tl.getInput('testSelector');
    const parallelExecution = tl.getVariable('System.ParallelExecutionType');

    if (testType && testType.toLowerCase() === 'testrun' && parallelExecution && parallelExecution.toLowerCase() === 'multiconfiguration') {
        return true;
    }

    return false;
}

function isServerBasedRun(): boolean {
    const batchType = tl.getInput('distributionBatchType');
    if (batchType && batchType === 'basedOnTestCases') {
        const batchSize = tl.getInput('batchingBasedOnAgentsOption');
        if (batchSize && batchSize === 'customBatchSize') {
            return true;
        }
    } else if (batchType && batchType === 'basedOnExecutionTime') {
        return true;
    } else if (batchType && batchType === 'basedOnAssembly') {
        return true;
    }

    const testType = tl.getInput('testSelector');
    tl.debug('Value of Test Selector :' + testType);
    if (testType.toLowerCase() === 'testplan' || testType.toLowerCase() === 'testrun') {
        return true;
    }

    const parallelExecution = tl.getVariable('System.ParallelExecutionType');
    tl.debug('Value of ParallelExecutionType :' + parallelExecution);

    if (parallelExecution && parallelExecution.toLowerCase() === 'multimachine') {
        const dontDistribute = tl.getBoolInput('dontDistribute');
        if (dontDistribute) {
            return false;
        }
        return true;
    }

    return false;
}