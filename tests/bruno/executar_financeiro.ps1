param(
    [int]$Porta = 3336
)

$ErrorActionPreference = 'Stop'

$diretorioScript = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositorio = Resolve-Path (Join-Path $diretorioScript '..\..')
$colecao = Join-Path $repositorio 'bruno\Sistema de Mensalidades'
$fixtureScript = Join-Path $repositorio 'tests\bruno\financeiro.fixture.ts'
$tsxWindowsShim = './tests/bruno/tsx_windows_shim.mjs'
$brunoCli = Join-Path $repositorio 'node_modules\.bin\bru.cmd'
$runId = [guid]::NewGuid().ToString()
$logSaida = Join-Path $env:TEMP "financeiro-bruno-$($runId.Replace('-', '')).out.log"
$logErro = Join-Path $env:TEMP "financeiro-bruno-$($runId.Replace('-', '')).err.log"
$nodeEnvAnterior = $env:NODE_ENV
$portaAnterior = $env:PORT
$runIdAnterior = $env:FINANCEIRO_BRUNO_RUN_ID
$env:FINANCEIRO_BRUNO_RUN_ID = $runId
$servidor = $null
$erroExecucao = $null
$limpezaFalhou = $false
$detalhesLimpeza = $null

try {
    $env:NODE_ENV = 'test'
    $env:PORT = $Porta.ToString()
    Push-Location $repositorio

    $preferenciaErroAnterior = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $saidaFixture = & node --import $tsxWindowsShim --env-file=.env.test --import tsx $fixtureScript setup 2>&1
    $codigoFixture = $LASTEXITCODE
    $ErrorActionPreference = $preferenciaErroAnterior
    if ($codigoFixture -ne 0) {
        throw "Falha ao preparar fixture Bruno financeira. $($saidaFixture -join [Environment]::NewLine)"
    }

    $linhaFixture = $saidaFixture |
        ForEach-Object { $_.ToString() } |
        Where-Object { $_.TrimStart().StartsWith('{') } |
        Select-Object -Last 1
    if (-not $linhaFixture) {
        throw 'A fixture financeira não retornou os dados de execução.'
    }
    $fixture = $linhaFixture | ConvertFrom-Json

    $servidor = Start-Process `
        -FilePath 'node' `
        -ArgumentList '--import', $tsxWindowsShim, '--env-file=.env.test', '--import', 'tsx', 'src/server.ts' `
        -WorkingDirectory $repositorio `
        -WindowStyle Hidden `
        -PassThru `
        -RedirectStandardOutput $logSaida `
        -RedirectStandardError $logErro

    $baseUrl = "http://127.0.0.1:$Porta/api/v1"
    $apiDisponivel = $false
    for ($tentativa = 0; $tentativa -lt 40; $tentativa++) {
        if ($servidor.HasExited) {
            $detalhes = Get-Content -LiteralPath $logErro -ErrorAction SilentlyContinue
            throw "A API de teste encerrou antes do Bruno. $detalhes"
        }
        try {
            $null = Invoke-WebRequest -Uri "$baseUrl/health" -UseBasicParsing -TimeoutSec 2
            $apiDisponivel = $true
            break
        } catch {
            Start-Sleep -Milliseconds 250
        }
    }
    if (-not $apiDisponivel) {
        throw "A API local de teste não ficou disponível na porta $Porta."
    }

    Push-Location $colecao
    try {
        $argumentosBruno = @(
            'run', 'Financeiro', '-r', '--env', 'Local',
            '--env-var', "baseUrl=$baseUrl",
            '--env-var', "financeiro-organizacao-id=$($fixture.organizacaoId)",
            '--env-var', "financeiro-organizacao-alternativa-id=$($fixture.organizacaoAlternativaId)",
            '--env-var', "financeiro-area-id=$($fixture.areaId)",
            '--env-var', "financeiro-area-outra-area-id=$($fixture.areaAlternativaId)",
            '--env-var', "financeiro-area-outra-organizacao-id=$($fixture.areaOutraOrganizacaoId)",
            '--env-var', "financeiro-admin-email=$($fixture.adminEmail)",
            '--env-var', "financeiro-admin-senha=$($fixture.adminSenha)",
            '--env-var', "financeiro-operador-email=$($fixture.operadorEmail)",
            '--env-var', "financeiro-operador-senha=$($fixture.operadorSenha)",
            '--env-var', "financeiro-cliente-id=$($fixture.clienteId)",
            '--env-var', "financeiro-cliente-outra-area-id=$($fixture.clienteOutraAreaId)",
            '--env-var', "financeiro-plano-existente-id=$($fixture.planoId)",
            '--env-var', "financeiro-plano-global-id=$($fixture.planoGlobalId)",
            '--env-var', "financeiro-plano-outra-area-id=$($fixture.planoOutraAreaId)",
            '--env-var', "financeiro-chave-parcial=bruno-parcial-$runId",
            '--env-var', "financeiro-chave-excesso=bruno-excesso-$runId",
            '--env-var', "financeiro-chave-final=bruno-final-$runId",
            '--bail', '--noproxy'
        )
        $preferenciaErroAnterior = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & $brunoCli @argumentosBruno
        $codigoBruno = $LASTEXITCODE
        $ErrorActionPreference = $preferenciaErroAnterior
        if ($codigoBruno -ne 0) {
            throw 'A coleção Bruno de financeiro falhou.'
        }
    } finally {
        Pop-Location
    }

    $preferenciaErroAnterior = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & node --import $tsxWindowsShim --env-file=.env.test --import tsx $fixtureScript verify
    $codigoVerificacao = $LASTEXITCODE
    $ErrorActionPreference = $preferenciaErroAnterior
    if ($codigoVerificacao -ne 0) {
        throw 'A verificação transacional pós-Bruno falhou.'
    }
} catch {
    $erroExecucao = $_
    throw
} finally {
    if ($servidor -and -not $servidor.HasExited) {
        Stop-Process -Id $servidor.Id -Force
        $servidor.WaitForExit()
    }

    if (Test-Path -LiteralPath $repositorio) {
        Push-Location $repositorio
        try {
            $preferenciaErroAnterior = $ErrorActionPreference
            $ErrorActionPreference = 'Continue'
            $saidaLimpeza = & node --import $tsxWindowsShim --env-file=.env.test --import tsx $fixtureScript cleanup 2>&1
            $codigoLimpeza = $LASTEXITCODE
            $ErrorActionPreference = $preferenciaErroAnterior
            if ($codigoLimpeza -ne 0) {
                $limpezaFalhou = $true
                $detalhesLimpeza = $saidaLimpeza -join [Environment]::NewLine
            }
        } finally {
            Pop-Location
        }
    }

    foreach ($arquivoLog in @($logSaida, $logErro)) {
        if (Test-Path -LiteralPath $arquivoLog) {
            Remove-Item -LiteralPath $arquivoLog -Force
        }
    }

    if ($null -eq $nodeEnvAnterior) { Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue }
    else { $env:NODE_ENV = $nodeEnvAnterior }
    if ($null -eq $portaAnterior) { Remove-Item Env:PORT -ErrorAction SilentlyContinue }
    else { $env:PORT = $portaAnterior }
    if ($null -eq $runIdAnterior) { Remove-Item Env:FINANCEIRO_BRUNO_RUN_ID -ErrorAction SilentlyContinue }
    else { $env:FINANCEIRO_BRUNO_RUN_ID = $runIdAnterior }

    Pop-Location
    if ($limpezaFalhou) {
        if ($erroExecucao) { Write-Warning "A limpeza da fixture também falhou. $detalhesLimpeza" }
        else { throw "A limpeza da fixture Bruno financeira falhou. $detalhesLimpeza" }
    }
}
