<#
.SYNOPSIS
  Roda os agentes de análise da Central Nova7 no processador deste computador, em paralelo, sem API de IA.

.DESCRIPTION
  A) Análise do site (padrão): coleta os dados (do site publicado, ou os de exemplo com -Fonte local) e distribui as tarefas
     (cérebro com os 21 agentes, cada semana fechada, calendário de cada cliente, ideias, qualidade dos dados) entre os núcleos.
  B) Central de Promoções (-Promocoes <pasta>): lê os PDFs "Analítico de vendas" e os estoques .xlsx da pasta, CONFERE cada leitura
     (todas as páginas, nenhuma linha desconhecida, soma igual ao "Total:" do rodapé ao centavo, duas leituras idênticas) e só
     analisa o que fechou. Arquivo que não fecha é RECUSADO e o motivo sai em leitura.md. Não precisa de login nem de internet.

  A senha NUNCA é gravada: ela é pedida na hora (ou lida das variáveis N7_EMAIL e N7_SENHA) e só vive no ambiente deste processo.
  Código de saída: 0 tudo certo; 3 algum arquivo de vendas/estoque foi recusado; outro número = erro.

.EXAMPLE
  .\Analisar.ps1                                          # análise do site publicado (pergunta e-mail e senha)
  .\Analisar.ps1 -Fonte local                             # dados de exemplo, sem login e sem internet
  .\Analisar.ps1 -SoPromocoes -Promocoes "C:\Sistema Marketing\inbox"   # só vendas e estoque, sem tocar no site
  .\Analisar.ps1 -SoPromocoes -Promocoes C:\pasta -SoConferir           # só confere a leitura dos arquivos (rápido)
  .\Analisar.ps1 -Promocoes C:\pasta -Nucleos 2 -NaoAbrir # site + promoções, 2 núcleos
#>
[CmdletBinding()]
param(
  [ValidateSet('producao', 'local')][string]$Fonte = 'producao',
  [string]$Promocoes = '',                 # pasta com vendas\*.pdf e estoque\*.xlsx (ou os arquivos soltos)
  [switch]$SoPromocoes,                    # pula a análise do site (não pede senha)
  [switch]$SoConferir,                     # com -Promocoes: só confere a leitura e para
  [int]$Nucleos = 0,                       # 0 = todos os núcleos lógicos
  [string]$Hoje = '',                      # AAAA-MM-DD (padrão: hoje)
  [string]$Saida = '',                     # pasta de saída (padrão: scripts\analise-local\saida\<data-hora>)
  [string]$Url = 'https://app7-eight.vercel.app',
  [switch]$NaoAbrir,
  [switch]$ManterDados,                    # não apaga o snapshot.json (tem dados dos clientes)
  [switch]$Armazem,                        # inclui a análise completa das lojas do armazém de vendas (relatórios que o Agente.ps1 foi guardando) e os relatórios HTML
  [string]$Marca = 'Nova7'                 # nome que aparece na capa do relatório HTML (a marca de quem entrega a análise)
)
$ErrorActionPreference = 'Stop'
$aqui = $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js não encontrado no PATH (precisa da versão 20 ou mais nova).' }
$ver = [int](((node -v) -replace '^v', '') -split '\.')[0]
if ($ver -lt 20) { throw "Node $ver é antigo demais: use a versão 20 ou mais nova." }
if ($SoPromocoes -and -not $Promocoes) { throw 'Com -SoPromocoes informe a pasta: -Promocoes "C:\caminho\da\pasta".' }
if ($Promocoes -and -not (Test-Path -LiteralPath $Promocoes -PathType Container)) { throw "A pasta não existe: $Promocoes" }

if (-not $Saida) { $Saida = Join-Path $aqui ('saida\' + (Get-Date -Format 'yyyy-MM-dd_HHmm')) }
New-Item -ItemType Directory -Force -Path $Saida | Out-Null
$codigo = 0

if (-not $SoPromocoes) {
  $snap = Join-Path $Saida 'snapshot.json'
  # --- A1. coleta ---
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
  # --- A2. análise em paralelo ---
  $args2 = @($snap, $Saida)
  if ($Nucleos -gt 0) { $args2 += @('--nucleos', $Nucleos) }
  if ($Hoje) { $args2 += @('--hoje', $Hoje) }
  if ($Armazem) { $args2 += @('--armazem', '--marca', $Marca) }
  node (Join-Path $aqui 'analisar.js') @args2
  if ($LASTEXITCODE -ne 0) { throw 'A análise falhou (veja a mensagem acima).' }
  # o snapshot guarda dados dos clientes: apaga depois da análise (use -ManterDados se quiser conferir)
  if (-not $ManterDados) { Remove-Item $snap -Force -ErrorAction SilentlyContinue }
}

# --- B. Central de Promoções: vendas (PDF) e estoque (.xlsx) ---
$pastaPromo = Join-Path $Saida 'promocoes'
if ($Promocoes) {
  Write-Host ''
  Write-Host "Lendo e conferindo os arquivos de $Promocoes ..." -ForegroundColor Cyan
  $args3 = @($Promocoes, $pastaPromo)
  if ($Nucleos -gt 0) { $args3 += @('--nucleos', $Nucleos) }
  if ($SoConferir) { $args3 += '--so-conferir' }
  node (Join-Path $aqui 'promocoes.js') @args3
  if ($LASTEXITCODE -eq 3) {
    $codigo = 3
    Write-Host ''
    Write-Warning 'ATENÇÃO: algum arquivo NÃO FECHOU na conferência e foi deixado de fora da análise. Veja o motivo em leitura.md.'
  } elseif ($LASTEXITCODE -ne 0) { throw 'A análise de promoções falhou (veja a mensagem acima).' }
}

Write-Host ''
if (-not $SoPromocoes) { Write-Host "Resumo do site:   $Saida\resumo.md" -ForegroundColor Green; Write-Host "Detalhado:        $Saida\resultado.json" }
if ($Promocoes) {
  Write-Host "Conferência:      $pastaPromo\leitura.md" -ForegroundColor Green
  if (-not $SoConferir) { Write-Host "Promoções:        $pastaPromo\promocoes.md  (listas em CSV na mesma pasta)" -ForegroundColor Green }
}
if (-not $NaoAbrir) {
  if (-not $SoPromocoes) { Invoke-Item (Join-Path $Saida 'resumo.md') }
  if ($Promocoes) { $alvo = if ($SoConferir) { 'leitura.md' } else { 'promocoes.md' }; Invoke-Item (Join-Path $pastaPromo $alvo) }
}
exit $codigo
