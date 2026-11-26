<#
.SYNOPSIS
  Roda os agentes de análise da Central Nova7 no processador deste computador, em paralelo, sem API de IA.

.DESCRIPTION
  1) Coleta os dados (do site publicado, ou os dados de exemplo do repositório com -Fonte local).
  2) Distribui as tarefas (cérebro com os 21 agentes, cada semana fechada, calendário de cada cliente,
     ideias, qualidade dos dados) entre os núcleos do processador.
  3) Grava resultado.json e resumo.md numa pasta com data e hora, e abre o resumo.

  A senha NUNCA é gravada: ela é pedida na hora (ou lida das variáveis N7_EMAIL e N7_SENHA) e só vive
  no ambiente deste processo.

.EXAMPLE
  .\Analisar.ps1                          # site publicado, todos os núcleos, pergunta e-mail e senha
  .\Analisar.ps1 -Fonte local             # dados de exemplo, sem login e sem internet
  .\Analisar.ps1 -Nucleos 2 -NaoAbrir     # só 2 núcleos, sem abrir o resumo
  .\Analisar.ps1 -Hoje 2026-11-30         # analisa como se fosse outro dia
#>
[CmdletBinding()]
param(
  [ValidateSet('producao', 'local')][string]$Fonte = 'producao',
  [int]$Nucleos = 0,                       # 0 = todos os núcleos lógicos
  [string]$Hoje = '',                      # AAAA-MM-DD (padrão: hoje)
  [string]$Saida = '',                     # pasta de saída (padrão: scripts\analise-local\saida\<data-hora>)
  [string]$Url = 'https://app7-eight.vercel.app',
  [switch]$NaoAbrir,
  [switch]$ManterDados                     # não apaga o snapshot.json (tem dados dos clientes)
)
$ErrorActionPreference = 'Stop'
$aqui = $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js não encontrado no PATH (precisa da versão 20 ou mais nova).' }
$ver = [int](((node -v) -replace '^v', '') -split '\.')[0]
if ($ver -lt 20) { throw "Node $ver é antigo demais: use a versão 20 ou mais nova." }

if (-not $Saida) { $Saida = Join-Path $aqui ('saida\' + (Get-Date -Format 'yyyy-MM-dd_HHmm')) }
New-Item -ItemType Directory -Force -Path $Saida | Out-Null
$snap = Join-Path $Saida 'snapshot.json'

# --- 1. coleta ---
$antes = @{ U = $env:N7_URL; E = $env:N7_EMAIL; S = $env:N7_SENHA }
try {
  if ($Fonte -eq 'producao') {
    $env:N7_URL = $Url
    if (-not $env:N7_EMAIL) { $env:N7_EMAIL = Read-Host 'E-mail de acesso ao site' }
    if (-not $env:N7_SENHA) {
      $sec = Read-Host 'Senha (não aparece na tela)' -AsSecureString
      $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
      try { $env:N7_SENHA = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    }
    node (Join-Path $aqui 'coletar.js') $snap
  } else {
    node (Join-Path $aqui 'coletar.js') $snap --local
  }
  if ($LASTEXITCODE -ne 0) { throw 'A coleta falhou (veja a mensagem acima).' }
} finally {
  $env:N7_URL = $antes.U; $env:N7_EMAIL = $antes.E; $env:N7_SENHA = $antes.S   # não deixa a senha no ambiente
}

# --- 2. análise em paralelo ---
$args2 = @($snap, $Saida)
if ($Nucleos -gt 0) { $args2 += @('--nucleos', $Nucleos) }
if ($Hoje) { $args2 += @('--hoje', $Hoje) }
node (Join-Path $aqui 'analisar.js') @args2
if ($LASTEXITCODE -ne 0) { throw 'A análise falhou (veja a mensagem acima).' }

# o snapshot guarda dados dos clientes: apaga depois da análise (use -ManterDados se quiser conferir)
if (-not $ManterDados) { Remove-Item $snap -Force -ErrorAction SilentlyContinue }

Write-Host ''
Write-Host "Resumo:    $Saida\resumo.md" -ForegroundColor Green
Write-Host "Detalhado: $Saida\resultado.json"
if (-not $NaoAbrir) { Invoke-Item (Join-Path $Saida 'resumo.md') }
