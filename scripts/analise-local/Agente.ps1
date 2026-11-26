<#
.SYNOPSIS
  Liga o computador da agência como "leitor" da Central de Promoções: quem solta um PDF de vendas ou um estoque .xlsx no site,
  de QUALQUER aparelho, tem o arquivo lido e conferido aqui, com o processador deste computador.

.DESCRIPTION
  O agente liga para o site (não abre porta nenhuma), pega os arquivos da fila, lê, confere ao centavo com o total do relatório
  e devolve o resultado. O site só deixa gravar o que fechou. Com o agente desligado, o site lê no próprio navegador (sem a conferência).

  Primeira vez:   .\Agente.ps1 -Configurar        (pede a chave LEITURA_TOKEN, que fica em %USERPROFILE%\.nova7\agente.json)
  Ligar agora:    .\Agente.ps1                    (deixe a janela aberta; Ctrl+C desliga)
  Ligar sozinho:  .\Agente.ps1 -Instalar          (inicia escondido toda vez que você entrar no Windows)
  Desligar isso:  .\Agente.ps1 -Remover
  Ver situação:   .\Agente.ps1 -Status
  Chave p/ Vercel: .\Agente.ps1 -CopiarChave  (copia a chave para a área de transferência, sem mostrar; cole em Vercel > Settings >
                   Environment Variables > LEITURA_TOKEN, tipo Sensitive, e faça Redeploy)

.EXAMPLE
  .\Agente.ps1 -Configurar -Token "cole-aqui-a-chave"
#>
[CmdletBinding()]
param(
  [switch]$Configurar,
  [string]$Token = '',
  [string]$Url = 'https://app7-eight.vercel.app',
  [switch]$Instalar,
  [switch]$Remover,
  [switch]$Status,
  [switch]$CopiarChave,
  [int]$Nucleos = 0,
  [string]$Nome = ''
)
$ErrorActionPreference = 'Stop'
$aqui = $PSScriptRoot
$pasta = Join-Path $env:USERPROFILE '.nova7'
$arquivo = Join-Path $pasta 'agente.json'
$tarefa = 'Nova7 Agente de Leitura'

function Testar-Node {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js não encontrado no PATH (precisa da versão 20 ou mais nova).' }
  $v = [int](((node -v) -replace '^v', '') -split '\.')[0]
  if ($v -lt 20) { throw "Node $v é antigo demais: use a versão 20 ou mais nova." }
}

if ($Configurar) {
  if (-not $Token) {
    $sec = Read-Host 'Cole a chave LEITURA_TOKEN (não aparece na tela)' -AsSecureString
    $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
    try { $Token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
  }
  if ($Token.Length -lt 24) { throw 'A chave precisa ter pelo menos 24 caracteres.' }
  New-Item -ItemType Directory -Force -Path $pasta | Out-Null
  [IO.File]::WriteAllText($arquivo, (@{ url = $Url; token = $Token } | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
  # só o seu usuário lê o arquivo da chave
  try { icacls $arquivo /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null } catch { }
  Write-Host "Chave guardada em $arquivo (só o seu usuário lê)." -ForegroundColor Green
  Write-Host 'Agora ligue com  .\Agente.ps1  ou deixe automático com  .\Agente.ps1 -Instalar'
  return
}

if ($CopiarChave) {
  if (-not (Test-Path $arquivo)) { throw 'Ainda não há chave neste computador. Rode primeiro:  .\Agente.ps1 -Configurar' }
  (Get-Content $arquivo -Raw | ConvertFrom-Json).token | Set-Clipboard
  Write-Host 'Chave copiada para a área de transferência (não foi mostrada). Cole na variável LEITURA_TOKEN da Vercel.' -ForegroundColor Green
  return
}

if ($Remover) {
  if (Get-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue) { Stop-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $tarefa -Confirm:$false; Write-Host 'Início automático removido.' -ForegroundColor Green }
  else { Write-Host 'O início automático não estava instalado.' }
  return
}

if ($Instalar) {
  Testar-Node
  if (-not (Test-Path $arquivo)) { throw 'Antes, configure a chave:  .\Agente.ps1 -Configurar' }
  $acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ("-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"{0}`"" -f $MyInvocation.MyCommand.Path)
  $gatilho = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
  $conf = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 99 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable
  Register-ScheduledTask -TaskName $tarefa -Action $acao -Trigger $gatilho -Settings $conf -Description 'Lê PDFs de vendas e estoques enviados à Central Nova7' -Force | Out-Null
  Start-ScheduledTask -TaskName $tarefa
  Write-Host 'Instalado: o agente liga sozinho quando você entra no Windows (já foi iniciado agora).' -ForegroundColor Green
  return
}

if ($Status) {
  $t = Get-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue
  Write-Host ("Chave configurada:    " + $(if (Test-Path $arquivo) { 'sim' } else { 'NÃO (rode -Configurar)' }))
  Write-Host ("Início automático:    " + $(if ($t) { 'instalado (' + $t.State + ')' } else { 'não instalado' }))
  $n = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.CommandLine -match 'analise-local.agente\.js' }).Count
  Write-Host ("Agente rodando agora: " + $(if ($n -gt 0) { 'sim' } else { 'não' }))
  if (Test-Path $arquivo) {
    $c = Get-Content $arquivo -Raw | ConvertFrom-Json
    try {
      Invoke-RestMethod -Uri ($c.url.TrimEnd('/') + '/api/leitura?acao=ola') -Headers @{ Authorization = "Bearer $($c.token)" } -TimeoutSec 20 | Out-Null
      Write-Host 'Site aceitou a chave: sim.' -ForegroundColor Green
    } catch { $m = if ($_.ErrorDetails -and $_.ErrorDetails.Message) { try { ($_.ErrorDetails.Message | ConvertFrom-Json).error } catch { $_.ErrorDetails.Message } } else { $_.Exception.Message }; Write-Host ('Site aceitou a chave: NÃO. ' + $m) -ForegroundColor Yellow }
  }
  return
}

# --- ligar o agente ---
Testar-Node
if (-not (Test-Path $arquivo) -and -not $env:LEITURA_TOKEN) { throw 'Falta a chave deste computador. Rode primeiro:  .\Agente.ps1 -Configurar' }
$a = @((Join-Path $aqui 'agente.js'))
if ($Nucleos -gt 0) { $a += @('--nucleos', $Nucleos) }
if ($Nome) { $a += @('--nome', $Nome) }
if ($Url -ne 'https://app7-eight.vercel.app') { $a += @('--url', $Url) }
node @a
exit $LASTEXITCODE
