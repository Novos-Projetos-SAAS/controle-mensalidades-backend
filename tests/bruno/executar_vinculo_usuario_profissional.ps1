param(
    [int]$Porta = 3335
)

$ErrorActionPreference = 'Stop'

$diretorioScript = Split-Path -Parent $MyInvocation.MyCommand.Path
$repositorio = Resolve-Path (Join-Path $diretorioScript '..\..')
$colecao = Join-Path $repositorio 'bruno\Sistema de Mensalidades'
$fixtureScript = Join-Path $repositorio 'tests\bruno\vinculo_usuario_profissional.fixture.ts'
$tsxWindowsShim = './tests/bruno/tsx_windows_shim.mjs'
$brunoCli = Join-Path $repositorio 'node_modules\.bin\bru.cmd'
$identificador = [guid]::NewGuid().ToString('N')
$logSaida = Join-Path $env:TEMP "vinculo-usuario-profissional-$identificador.out.log"
$logErro = Join-Path $env:TEMP "vinculo-usuario-profissional-$identificador.err.log"
$nodeEnvAnterior = $env:NODE_ENV
$portaAnterior = $env:PORT
$servidor = $null
$limpezaFalhou = $false
$detalhesLimpeza = $null
$erroExecucao = $null

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
        $detalhesFixture = $saidaFixture -join [Environment]::NewLine
        throw "Falha ao preparar a fixture de vinculo usuario-profissional. $detalhesFixture"
    }

    $linhaFixture = $saidaFixture |
        ForEach-Object { $_.ToString() } |
        Where-Object { $_.TrimStart().StartsWith('{') } |
        Select-Object -Last 1

    if (-not $linhaFixture) {
        throw 'A fixture nao retornou os dados necessarios para o Bruno.'
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
            throw "A API de teste encerrou antes da execucao do Bruno. $detalhes"
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
        throw "A API de teste nao ficou disponivel na porta $Porta."
    }

    Push-Location $colecao
    try {
        $argumentosBruno = @(
            'run',
            'Vinculo Usuario Profissional',
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
            "clinico-admin-email=$($fixture.adminEmail)",
            '--env-var',
            "clinico-admin-senha=$($fixture.adminSenha)",
            '--env-var',
            "clinico-operador-email=$($fixture.operadorEmail)",
            '--env-var',
            "clinico-operador-senha=$($fixture.operadorSenha)",
            '--env-var',
            "vinculo-profissional-id=$($fixture.profissionalId)",
            '--env-var',
            "vinculo-outro-profissional-id=$($fixture.outroProfissionalId)",
            '--env-var',
            "vinculo-usuario-id=$($fixture.usuarioDisponivelId)",
            '--env-var',
            "vinculo-usuario-ja-associado-id=$($fixture.usuarioJaAssociadoId)",
            '--env-var',
            "vinculo-profissional-outra-org-id=$($fixture.profissionalOutraOrganizacaoId)",
            '--env-var',
            "vinculo-usuario-outra-org-id=$($fixture.usuarioOutraOrganizacaoId)",
            '--env-var',
            "vinculo-area-sem-agenda-id=$($fixture.areaSemAgendaId)",
            '--bail',
            '--noproxy'
        )

        $preferenciaErroAnterior = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & $brunoCli @argumentosBruno
        $codigoBruno = $LASTEXITCODE
        $ErrorActionPreference = $preferenciaErroAnterior

        if ($codigoBruno -ne 0) {
            throw 'A colecao Bruno de vinculo usuario-profissional falhou.'
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
        throw 'A verificacao final da fixture de vinculo falhou.'
    }
} catch {
    $erroExecucao = $_
    throw
} finally {
    if ($servidor -and -not $servidor.HasExited) {
        Stop-Process -Id $servidor.Id -Force
        $servidor.WaitForExit()
    }

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
        if ($erroExecucao) {
            Write-Warning "A limpeza da fixture tambem falhou. $detalhesLimpeza"
        } else {
            throw "A limpeza da fixture de vinculo usuario-profissional falhou. $detalhesLimpeza"
        }
    }
}
