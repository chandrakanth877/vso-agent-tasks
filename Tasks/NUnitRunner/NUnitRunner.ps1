###########Define Variables########
param(
    [string]$libsPath,
    [string]$libsToRun,
    [string]$includeCategories,
    [string]$excludeCategories,
    [string]$testsToRun,
    [string]$platformX86,
    [string]$platformX64,
    [string]$separateRun,
    [string]$failOnTestFailure,
    [string]$nunitVersion
)


########### Functions #############
function NunitCmdLineRunner
{
    param(
        [string]$Platform
    )

    $Platform = $Platform.ToLower()
    #set tool path according to platform
    if(($Platform -eq "x86") -or ($Platform -eq "win32")) {        
        $nunitToolPath = """C:\Program Files (x86)\NUnit " + $nunitVersion + "\bin\nunit-console-x86.exe"""
    }
    else {
        $nunitToolPath = """C:\Program Files (x86)\NUnit " + $nunitVersion + "\bin\nunit-console.exe"""
    }
    if ($nunitVersion.StartsWith("3.")) {
        $nunitToolPath = """C:\Program Files (x86)\NUnit.org\nunit-console\nunit3-console.exe"""
    }

    #$workingDir = $env:BUILD_REPOSITORY_LOCALPATH 
    #$workingDir = $libsPath

    [string[]]$libsArray = $libsToRun.Split(',');

    foreach ($item in $libsArray) {
        Write-Host "Searching for files that matchs the name [$item] (at folder [$libsPath])"
        #need to make sure that the file path not contains wrong platform 
        if(($Platform -eq "x86") -or ($Platform -eq "win32")) {        
            $libs = Get-ChildItem -Path $libsPath -Recurse -filter "$item" | Where-Object {
                ($_.FullName.ToString().ToLower()) -notlike "*x64*" -and ($_.FullName.ToString().ToLower()) -notlike "*win64*"
            }
        }
        else {
            $libs = Get-ChildItem -Path $libsPath -Recurse -filter "$item" | Where-Object {
                ($_.FullName.ToString().ToLower()) -notlike "*x86*" -and ($_.FullName.ToString().ToLower()) -notlike "*win32*"
            }
        }

        if(!$libs) {
            Write-Warning "WARN: File named [$item] that fit platform [$Platform] NOT found."
            Write-Warning "WARN: No tests will be executed on platform [$Platform]."
            Break
        }
        else {
            #loop to run each test lib
            foreach ($lib in $libs) {               
                $libFullPath = ($lib.FullName)
                $libWorkingDir = Split-Path $libFullPath -Parent
                $libWorkingDir = $libWorkingDir
                $libName = [io.path]::GetFileNameWithoutExtension($libFullPath)

                Write-Host "File named [$item] found at: $libFullPath"

                $nunitArgs = ("""{0}""" -f $libFullPath)
                $nunitLogName = ("{0}\log_{1}_{2}" -f $libWorkingDir, $Platform, $libName)

                if($excludeCategories){
                    if ($nunitVersion.StartsWith("3.")){
                        $nunitArgs += " --where cat!=$excludeCategories"
                    }
                    else{
                        $nunitArgs += " /exclude:""$excludeCategories"""
                    }
                }                
                
                if([System.Convert]::ToBoolean($separateRun)) { # run separately
                    $separator = ","
                    $listOfCategories = $includeCategories.Split($separator)
                    $listOfTestsToRun = $testsToRun.Split($separator)

                    if($listOfCategories) { 
                        Write-Host "Tests Categories: $listOfCategories"
                        foreach ($categoryName in $listOfCategories) {                                    
                            if($listOfTestsToRun) {
                                foreach ($testName in $listOfTestsToRun) {   
                                    if ($nunitVersion.StartsWith("3.")){
                                        $args = $nunitArgs + " --where cat==$categoryName" + " --test=$testName"
                                    }
                                    else{
                                        $args = $nunitArgs + " /include:""$categoryName""" + " /run:$testName"
                                    }                  
                                    $args = $nunitArgs + " /include:""$categoryName""" + " /run:$testName"
                                    $logName = ("{0}_{1}_{2}" -f $nunitLogName, $categoryName, $testName)
                                    NunitToolRunner -toolPath $nunitToolPath -workingDir $libWorkingDir -arguments $args -logName $logName
                                }                                
                            }
                            else {  
                                if ($nunitVersion.StartsWith("3.")){
                                    $args = $nunitArgs + " --where cat==$categoryName" 
                                }
                                else{
                                    $args = $nunitArgs + " /include:""$categoryName"""
                                }                               
                                $logName = ("{0}_{1}" -f $nunitLogName, $categoryName)
                                NunitToolRunner -toolPath $nunitToolPath -workingDir $libWorkingDir -arguments $args -logName $logName                          
                            }
                        }
                   }
                   else {
                        if($listOfTestsToRun) {
                            Write-Host "Tests: $listOfTestsToRun"
                            foreach ($testName in $listOfTestsToRun) {    
                                if ($nunitVersion.StartsWith("3.")){
                                    $args = $nunitArgs + " --test=$testsToRun" 
                                }
                                else{
                                    $args = $nunitArgs + " /run:$testsToRun"        
                                }                                                    
                                $logName = ("{0}_{1}" -f $nunitLogName, $testsToRun)
                                NunitToolRunner -toolPath $nunitToolPath -workingDir $libWorkingDir -arguments $args -logName $logName
                            }
                        }
                        else {                         
                            NunitToolRunner -toolPath $nunitToolPath -workingDir $libWorkingDir -arguments $nunitArgs -logName $nunitLogName
                        }
                   }
                }
                else { # regular run 
                    if($includeCategories){
                        if ($nunitVersion.StartsWith("3.")){
                            $nunitArgs += " --where cat==$includeCategories" 
                        }
                        else{
                            $nunitArgs += " /include:""$includeCategories"""
                        }
                    }  
                    if($testsToRun){
                        if ($nunitVersion.StartsWith("3.")){
                            $nunitArgs += " --test=$testsToRun" 
                        }
                        else{
                            $nunitArgs += " /run:$testsToRun"
                        }
                    }

                    NunitToolRunner -toolPath $nunitToolPath -workingDir $libWorkingDir -arguments $nunitArgs -logName $nunitLogName
                }
                Write-Host "******************************************************************************" 
            }
        }
    }
}

function NunitToolRunner
{
    param(
        [string]$toolPath,
        [string]$workingDir,
        [string]$arguments,
        [string]$logName
    )
    
    $arguments += (" /out:""{0}_log.log""" -f $logName)
    $arguments += (" /err:""{0}_err.log""" -f $logName)
    $result = ("""{0}_out.xml""" -f $logName) 

    if ($toolPath.Contains("nunit3")) {
       $arguments += (" /result:{0};format=nunit2" -f $result) 
    }
    else {
        $arguments += (" /result:{0}" -f $result) 
    }       

    $commandLine = ("{0} {1}" -f $ToolPath, $arguments)
    Write-Host "Running:= $commandLine"
    Write-Host "Working Directory:= $workingDir"
    #Invoke-Command -ScriptBlock { cmd /c "$commandLine"}

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo.FileName = $ToolPath
    $process.StartInfo.Arguments = $arguments
    $process.StartInfo.UseShellExecute = $false
    $process.StartInfo.RedirectStandardOutput = $true
    $process.StartInfo.WorkingDirectory = $workingDir

    if ( $process.Start() ) {
        $output = $process.StandardOutput.ReadToEnd() `
        -replace "\r\n$",""
        if ( $output ) {
            if ( $output.Contains("`r`n") ) {
                $output -split "`r`n"
            }
            elseif ( $output.Contains("`n") ) {
                $output -split "`n"
            }
            else {
                $output
            }
        }
        if($process.StandardError) {
            $errOutput = $process.StandardError.ReadToEnd() `
            -replace "\r\n$",""
            if ( $errOutput ) {
                if ( $errOutput.Contains("`r`n") ) {
                    $errOutput -split "`r`n"
                }
                elseif ( $errOutput.Contains("`n") ) {
                    $errOutput -split "`n"
                }
                else {
                    $errOutput
                }
            }
        }
        $process.WaitForExit()
        #& "$Env:SystemRoot\system32\cmd.exe" `
        #/c exit $process.ExitCode

        Write-Host $output
        Write-Host $sterrOutput
        $LASTEXITCODE = $process.ExitCode
    }

    if([System.Convert]::ToBoolean($failOnTestFailure)) {
        CheckTestsStatus -xmlPath $result
    }
}

function CheckTestsStatus
{
    param(
        [string]$xmlPath
    )

    #$xmlContent = [IO.File]::ReadAllLines($xmlPath)
    #if(!($xmlContent -like "*failures=""0""*")) {
    #    Write-Warning "ERROR: Some Tests Failed"
    #}

    if($LASTEXITCODE -ne 0) {
        $error = "ERROR: Tests failed and returns exit code = $LASTEXITCODE (see: [$xmlPath])"
        Write-Error $error
        #Write-Host "##vso[task.logissue type=error;]$error"
    }
}


########### Execution #############
if(!$libsPath) {
    $libsPath = $env:AGENT_BULDDIRECTORY
}
Write-Host "Tests Libraries Path: $libsPath"

Try
{
    if([System.Convert]::ToBoolean($platformX86)){
        Write-Host "******************************* Run x86 Tests *******************************"
        NunitCmdLineRunner -Platform "x86"
    }

    if([System.Convert]::ToBoolean($platformX64)){
        Write-Host "******************************* Run x64 Tests *******************************"
        $strCommand += $nunitX64Path
        NunitCmdLineRunner -Platform "x64"
    }
}

Catch
{
    Write-Error $_.Exception.ToString()
}

Finally
{
    Write-Output "Execution Completed."
}

#################################################################################