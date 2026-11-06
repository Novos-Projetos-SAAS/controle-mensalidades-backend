param(
    [int]$Porta = 3334
)

$ErrorActionPreference = 'Stop'

$diretorioScript = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositorio = Resolve-Path (Join-Path $diretorioScript '..\..')
$colecao = Join-Path $repositorio 'bruno\Sistema de Mensalidades'
$fixtureScript = Join-Path $repositorio 'tests\bruno\permissoes_clinicas.fixture.ts'
$brunoCli = Join-Path $repositorio 'node_modules\.bin\bru.cmd'
$identificador = [guid]::NewGuid().ToString('N')
$logSaida = Join-Path $env:TEMP "permissoes-clinicas-$identificador.out.log"
$logErro = Join-Path $env:TEMP "permissoes-clinicas-$identificador.err.log"
$nodeEnvAnterior = $env:NODE_ENV
$portaAnterior = $env:PORT
$servidor = $null
$limpezaFalhou = $false

try {
    $env:NODE_ENV = 'test'
    $env:PORT = $Porta.ToString()

    Push-Location $repositorio

    $preferenciaErroAnterior = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $saidaFixture = & node --env-file=.env.test --import tsx $fixtureScript setup 2>&1
    $codigoFixture = $LASTEXITCODE
    $ErrorActionPreference = $preferenciaErroAnterior

    if ($codigoFixture -ne 0) {
        throw 'Falha ao preparar a fixture de permissões clínicas.'
    }

    $linhaFixture = $saidaFixture |
        ForEach-Object { $_.ToString() } |
        Where-Object { $_.TrimStart().StartsWith('{') } |
        Select-Object -Last 1

    if (-not $linhaFixture) {
        throw 'A fixture não retornou os dados necessários para o Bruno.'
    }

    $fixture = $linhaFixture | ConvertFrom-Json

    $servidor = Start-Process `
        -FilePath 'node' `
        -ArgumentList '--env-file=.env.test', '--import', 'tsx', 'src/server.ts' `
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
            throw "A API de teste encerrou antes da execução do Bruno. $detalhes"
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
        throw "A API de teste não ficou disponível na porta $Porta."
    }

    Push-Location $colecao
    try {
        $argumentosBruno = @(
            'run',
            'Permissoes Clinicas',
            '-r',
            '--env',
            'Local',
            '--env-var',
            "baseUrl=$baseUrl",
            '--env-var',
            "organizacao-id=$($fixture.organizacaoId)",
            '--env-var',
            "area-negocio-id=$($fixture.areaNegocioId)",
            '--env-var',
            "profissional-id=$($fixture.profissionalId)",
            '--env-var',
            "clinico-admin-email=$($fixture.adminEmail)",
            '--env-var',
            "clinico-admin-senha=$($fixture.adminSenha)",
            '--env-var',
            "clinico-operador-email=$($fixture.operadorEmail)",
            '--env-var',
            "clinico-operador-senha=$($fixture.operadorSenha)",
            '--bail',
            '--noproxy'
        )

        $preferenciaErroAnterior = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & $brunoCli @argumentosBruno
        $codigoBruno = $LASTEXITCODE
        $ErrorActionPreference = $preferenciaErroAnterior

        if ($codigoBruno -ne 0) {
            throw 'A coleção Bruno de permissões clínicas falhou.'
        }
    } finally {
        Pop-Location
    }
} finally {
    if ($servidor -and -not $servidor.HasExited) {
        Stop-Process -Id $servidor.Id -Force
        $servidor.WaitForExit()
    }

    Push-Location $repositorio
    try {
        $preferenciaErroAnterior = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & node --env-file=.env.test --import tsx $fixtureScript cleanup 2>&1 | Out-Null
        $codigoLimpeza = $LASTEXITCODE
        $ErrorActionPreference = $preferenciaErroAnterior

        if ($codigoLimpeza -ne 0) {
            $limpezaFalhou = $true
        }
    } finally {
        Pop-Location
    }

    foreach ($arquivoLog in @($logSaida, $logErro)) {
        if (Test-Path -LiteralPath $arquivoLog) {
            Remove-Item -LiteralPath $arquivoLog -Force
        }
    }

    if ($null -eq $nodeEnvAnterior) {
        Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
    } else {
        $env:NODE_ENV = $nodeEnvAnterior
    }

    if ($null -eq $portaAnterior) {
        Remove-Item Env:PORT -ErrorAction SilentlyContinue
    } else {
        $env:PORT = $portaAnterior
    }

    Pop-Location

    if ($limpezaFalhou) {
        throw 'A limpeza da fixture de permissões clínicas falhou.'
    }
}
