param (
    [Parameter(Mandatory=$true)][string]$TemplatePath,
    [Parameter(Mandatory=$true)][string]$OutputPath,
    [Parameter(Mandatory=$true)][string]$PayloadPath
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $PayloadPath)) {
    Write-Error "Payload file not found: $PayloadPath"
    exit 1
}

$payloadRaw = Get-Content $PayloadPath -Raw -Encoding UTF8 | ConvertFrom-Json
$scope = $payloadRaw.scope
$calcData = $payloadRaw.calcData

$districtName = if ($scope.self_name) { [string]$scope.self_name.ToUpper() } else { "DISTRICT" }
$cutoffDate = [string]$calcData.cutoff_date
$yearNum = [string]$calcData.year_num
$children = $scope.children
$displayNames = $scope.display_names

# Ensure output directory exists
$outDir = Split-Path -Path $OutputPath -Parent
if ($outDir -and -not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

function Set-CellValue($sheet, [int]$r, [int]$c, $val) {
    if ($null -ne $val -and "$val" -ne "") {
        $cell = $sheet.Cells.Item($r, $c)
        $cell.Value2 = [string]$val
    }
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.ScreenUpdating = $false

try {
    # Open template read-only
    $wb = $excel.Workbooks.Open($TemplatePath, $false, $true)

    # 1. Rcell DD (Keep sheet name intact so formulas referencing 'Rcell DD North' remain valid)
    foreach ($ws in $wb.Worksheets) {
        if ($ws.Name -like "*Rcell DD*") {
            Set-CellValue $ws 1 2 "Rcell Crime Diary $yearNum"
            Set-CellValue $ws 2 1 $districtName
            for ($i = 0; $i -lt $children.Count; $i++) {
                $ps = $children[$i]
                $psId = [string]$ps.id
                $name = if ($displayNames.$psId) { [string]$displayNames.$psId } else { [string]$ps.name }
                Set-CellValue $ws (3 + $i) 1 $name
            }
            break
        }
    }

    # 2. R Cell- Distt Crime
    foreach ($ws in $wb.Worksheets) {
        if ($ws.Name -eq "R Cell- Distt Crime") {
            Set-CellValue $ws 1 1 "R Cell Daily Diary- $districtName District"
            Set-CellValue $ws 3 2 "Upto Date $([int]$yearNum - 1)"
            Set-CellValue $ws 3 5 "Upto Date $yearNum"
            break
        }
    }

    # 3. E-FIR
    foreach ($ws in $wb.Worksheets) {
        if ($ws.Name -like "*E-FIR*") {
            Set-CellValue $ws 1 1 "E-FIR OF $districtName DISTRICT"
            break
        }
    }

    # 4. N-1,N-2,N-3
    foreach ($ws in $wb.Worksheets) {
        if ($ws.Name -like "*N-1,N-2,N-3*") {
            Set-CellValue $ws 1 1 "Daily $districtName District Crime"
            break
        }
    }

    # 5. D1,N-1,2,3 Res
    foreach ($ws in $wb.Worksheets) {
        if ($ws.Name -like "*D1,N-1,2,3 Res*") {
            Set-CellValue $ws 1 1 "DAILY DIARY $districtName DISTRICT"
            break
        }
    }

    # 7. Daily Chart, Heinous, IPC
    foreach ($ws in $wb.Worksheets) {
        if ($ws.Name -eq "Daily Chart, Heinous, IPC") {
            Set-CellValue $ws 1 1 "PS Wise Crime Chart — $districtName"
            for ($i = 0; $i -lt $children.Count; $i++) {
                $ps = $children[$i]
                $psId = [string]$ps.id
                $name = if ($displayNames.$psId) { [string]$displayNames.$psId } else { [string]$ps.name }
                Set-CellValue $ws (6 + $i) 1 $name
            }
            break
        }
    }

    # 8. DCsP- Crime Chart
    foreach ($ws in $wb.Worksheets) {
        if ($ws.Name -like "*DCsP- Crime Chart*") {
            Set-CellValue $ws 1 1 "DAILY DIARY $districtName DISTRICT"
            break
        }
    }

    # 9. D-2 Heinous Brief Fact
    foreach ($ws in $wb.Worksheets) {
        if ($ws.Name -eq "D-2 Heinous Brief Fact") {
            Set-CellValue $ws 1 10 $cutoffDate
            $heinousList = $calcData.heinousList
            if ($heinousList) {
                for ($i = 0; $i -lt $heinousList.Count; $i++) {
                    $item = $heinousList[$i]
                    $r = 4 + $i
                    Set-CellValue $ws $r 1 ($i + 1)
                    Set-CellValue $ws $r 2 $item.ps_name
                    Set-CellValue $ws $r 3 $item.fir_no
                    Set-CellValue $ws $r 9 $item.brief_facts
                }
            }
            break
        }
    }

    # 10. Upto PCR calls
    foreach ($ws in $wb.Worksheets) {
        if ($ws.Name -like "*Upto PCR calls*") {
            for ($i = 0; $i -lt $children.Count; $i++) {
                $ps = $children[$i]
                $psId = [string]$ps.id
                $name = if ($displayNames.$psId) { [string]$displayNames.$psId } else { [string]$ps.name }
                $r = 4 + $i
                Set-CellValue $ws $r 1 ($i + 1)
                Set-CellValue $ws $r 2 $name
            }
            break
        }
    }

    # 11. D-8 Brief Facts
    foreach ($ws in $wb.Worksheets) {
        if ($ws.Name -eq "D-8 Brief Facts") {
            Set-CellValue $ws 1 10 $cutoffDate
            Set-CellValue $ws 2 2 "DAILY CRIME (PS FIR ) WITH BRIEF FACTS OF $districtName DISTRICT  :"
            $fullFir = $calcData.fullFirList
            if ($fullFir) {
                for ($i = 0; $i -lt $fullFir.Count; $i++) {
                    $item = $fullFir[$i]
                    $r = 5 + $i
                    Set-CellValue $ws $r 1 ($i + 1)
                    Set-CellValue $ws $r 2 $item.ps_name
                    Set-CellValue $ws $r 3 $item.fir_no
                    Set-CellValue $ws $r 8 $item.brief_facts
                }
            }
            break
        }
    }

    # 12. D-9 FIR Arrests
    foreach ($ws in $wb.Worksheets) {
        if ($ws.Name -like "*D-9 FIR Arrests*") {
            Set-CellValue $ws 2 3 "DAILY MORNING DIARY REGARDING PERSONS ARRESTED IN FIR, $districtName DISTRICT"
            $firArrests = $calcData.firArrestsList
            if ($firArrests) {
                for ($i = 0; $i -lt $firArrests.Count; $i++) {
                    $item = $firArrests[$i]
                    $r = 6 + $i
                    Set-CellValue $ws $r 1 ($i + 1)
                    Set-CellValue $ws $r 2 $item.ps_name
                    Set-CellValue $ws $r 3 $item.person_name
                    Set-CellValue $ws $r 4 $item.age
                    Set-CellValue $ws $r 7 $item.fir_no
                    Set-CellValue $ws $r 13 $item.custody_status
                }
            }
            break
        }
    }

    # 13. D-9 Kal Arrests
    foreach ($ws in $wb.Worksheets) {
        if ($ws.Name -eq "D-9 Kal Arrests") {
            Set-CellValue $ws 2 1 "DAILY MORNING DIARY REGARDING PERSONS ARRESTED IN KALANDRAS,  $districtName DISTRICT"
            $kalArrests = $calcData.kalArrestsList
            if ($kalArrests) {
                for ($i = 0; $i -lt $kalArrests.Count; $i++) {
                    $item = $kalArrests[$i]
                    $r = 6 + $i
                    Set-CellValue $ws $r 1 ($i + 1)
                    Set-CellValue $ws $r 2 $item.ps_name
                    Set-CellValue $ws $r 3 $item.person_name
                    Set-CellValue $ws $r 4 $item.age
                    Set-CellValue $ws $r 13 $item.custody_status
                }
            }
            break
        }
    }

    # 14. D10 Action of 66 DP Act
    foreach ($ws in $wb.Worksheets) {
        if ($ws.Name -like "*D10 Action of 66 DP Act*") {
            for ($i = 0; $i -lt $children.Count; $i++) {
                $ps = $children[$i]
                $psId = [string]$ps.id
                $name = if ($displayNames.$psId) { [string]$displayNames.$psId } else { [string]$ps.name }
                $r = 4 + $i
                Set-CellValue $ws $r 1 $name
                Set-CellValue $ws $r 11 $name
            }
            break
        }
    }

    # 15. D13 66DP
    foreach ($ws in $wb.Worksheets) {
        if ($ws.Name -eq "D13 66DP") {
            Set-CellValue $ws 2 1 "VEHICLE SEIZED OF $districtName DISTRICT UNDER 66 DP ACT"
            for ($i = 0; $i -lt $children.Count; $i++) {
                $ps = $children[$i]
                $psId = [string]$ps.id
                $name = if ($displayNames.$psId) { [string]$displayNames.$psId } else { [string]$ps.name }
                $r = 5 + $i
                Set-CellValue $ws $r 1 $name
            }
            break
        }
    }

    # 16. G-22 Daily Crime
    foreach ($ws in $wb.Worksheets) {
        if ($ws.Name -eq "G-22 Daily Crime") {
            Set-CellValue $ws 1 1 "Daily Crime $districtName District"
            Set-CellValue $ws 5 1 $districtName
            break
        }
    }

    # 17. Accident Cases
    foreach ($ws in $wb.Worksheets) {
        if ($ws.Name -eq "Accident Cases") {
            Set-CellValue $ws 3 1 $districtName
            $accidents = $calcData.accidentList
            if ($accidents) {
                for ($i = 0; $i -lt $accidents.Count; $i++) {
                    $item = $accidents[$i]
                    $r = 6 + $i
                    Set-CellValue $ws $r 1 ($i + 1)
                    Set-CellValue $ws $r 2 "$($item.ps_name) - $($item.fir_no): $($item.brief_facts)"
                }
            }
            break
        }
    }

    # Recalculate all formulas natively in Excel before saving
    $wb.Calculate()

    # Save format 51 = xlOpenXMLWorkbook (.xlsx)
    $wb.SaveAs($OutputPath, 51)
    $wb.Close($false)
    Write-Host "SUCCESS: Generated cleanly via Native Excel COM"
}
finally {
    $excel.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($excel) | Out-Null
}
