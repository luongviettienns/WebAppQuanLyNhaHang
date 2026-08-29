# scripts/verify-database.ps1
# Kiem tra ket noi va tinh co lap cua co so du lieu MySQL Dev & Test

$ErrorActionPreference = "Stop"

function Get-EnvMap {
    param([string]$FilePath)
    $map = @{}
    if (Test-Path $FilePath) {
        Get-Content $FilePath | ForEach-Object {
            $line = $_.Trim()
            if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
                $idx = $line.IndexOf("=")
                $key = $line.Substring(0, $idx).Trim()
                $val = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
                $map[$key] = $val
            }
        }
    }
    return $map
}

Write-Host "=== KIEM TRA CO SO DU LIEU MYSQL CRISPY BITE ===" -ForegroundColor Cyan

# 1. Doc bien moi truong tu file .env hoac moi truong he thong
$envMap = Get-EnvMap -FilePath ".env"

$devUrl = if ($envMap.ContainsKey("DATABASE_URL")) { $envMap["DATABASE_URL"] } else { $env:DATABASE_URL }
$testUrl = if ($envMap.ContainsKey("TEST_DATABASE_URL")) { $envMap["TEST_DATABASE_URL"] } else { $env:TEST_DATABASE_URL }

if (-not $devUrl) {
    Write-Error "LOI: Bien DATABASE_URL chua duoc dinh nghia trong .env hoac moi truong!"
    exit 1
}

if (-not $testUrl) {
    Write-Error "LOI: Bien TEST_DATABASE_URL chua duoc dinh nghia trong .env hoac moi truong!"
    exit 1
}

if ($devUrl -eq $testUrl) {
    Write-Error "LOI BAO MAT: DATABASE_URL va TEST_DATABASE_URL khong duoc trung nhau de tranh mat mat du lieu!"
    exit 1
}

Write-Host "[OK] Da tim thay 2 chuoi ket noi doc lap:" -ForegroundColor Green
Write-Host "  - DEV DB : $devUrl"
Write-Host "  - TEST DB: $testUrl"

# 2. Parse MySQL URL (mysql://user:pass@host:port/database)
function Parse-MySqlUrl {
    param([string]$url)
    $pattern = '^mysql:\/\/(?:([^:]+)(?::([^@]*))?@)?([^:\/]+)(?::(\d+))?\/(.+)$'
    if ($url -match $pattern) {
        return @{
            User = if ($Matches[1]) { $Matches[1] } else { "root" }
            Password = if ($Matches[2]) { $Matches[2] } else { "" }
            Host = if ($Matches[3]) { $Matches[3] } else { "localhost" }
            Port = if ($Matches[4]) { [int]$Matches[4] } else { 3306 }
            Database = $Matches[5]
        }
    } else {
        throw "Chuoi ket noi MySQL khong hop le: $url"
    }
}

$devConfig = Parse-MySqlUrl -url $devUrl
$testConfig = Parse-MySqlUrl -url $testUrl

# 3. Kiem tra MySQL CLI hoac TCP connection
$mysqlPaths = @(
    "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe",
    "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe",
    "C:\Program Files\MySQL\MySQL Server 8.1\bin\mysql.exe",
    "C:\Program Files\MySQL\MySQL Server 8.2\bin\mysql.exe",
    "C:\Program Files\MySQL\MySQL Server 8.3\bin\mysql.exe",
    "mysql.exe"
)

$mysqlCli = $null
foreach ($path in $mysqlPaths) {
    if (Get-Command $path -ErrorAction SilentlyContinue) {
        $mysqlCli = $path
        break
    }
    if (Test-Path $path) {
        $mysqlCli = $path
        break
    }
}

if (-not $mysqlCli) {
    Write-Host "[CANH BAO] Khong tim thay mysql.exe CLI, kiem tra ket noi qua TCP port..." -ForegroundColor Yellow
    $tcp = New-Object System.Net.Sockets.TcpClient
    try {
        $tcp.Connect($devConfig.Host, $devConfig.Port)
        Write-Host "[OK] Port $($devConfig.Port) dang mo va san sang lang nghe." -ForegroundColor Green
    } catch {
        Write-Error "Khong the ket noi den MySQL tren $($devConfig.Host):$($devConfig.Port) - $_"
        exit 1
    } finally {
        $tcp.Close()
    }
} else {
    Write-Host "[OK] Tim thay MySQL CLI: $mysqlCli" -ForegroundColor Green
    
    # Test ket noi DEV DB
    Write-Host "Kiem tra database $($devConfig.Database)..." -NoNewline
    $env:MYSQL_PWD = $devConfig.Password
    $devTest = & $mysqlCli -h $devConfig.Host -P $devConfig.Port -u $devConfig.User -e "USE $($devConfig.Database); SELECT 1;" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host " [FAIL]" -ForegroundColor Red
        Write-Error "Loi ket noi vao database $($devConfig.Database): $devTest"
        exit 1
    }
    Write-Host " [OK]" -ForegroundColor Green

    # Test ket noi TEST DB
    Write-Host "Kiem tra database $($testConfig.Database)..." -NoNewline
    $env:MYSQL_PWD = $testConfig.Password
    $testTest = & $mysqlCli -h $testConfig.Host -P $testConfig.Port -u $testConfig.User -e "USE $($testConfig.Database); SELECT 1;" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host " [FAIL]" -ForegroundColor Red
        Write-Error "Loi ket noi vao database $($testConfig.Database): $testTest"
        exit 1
    }
    Write-Host " [OK]" -ForegroundColor Green
    $env:MYSQL_PWD = $null
}

Write-Host "`n>>> TAT CA KIEM TRA CO SO DU LIEU THANH CONG! <<<" -ForegroundColor Green
exit 0
