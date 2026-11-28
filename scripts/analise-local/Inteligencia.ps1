<#
.SYNOPSIS
  Inteligência de vendas da semana: o que vendeu, subiu, caiu e parou, e onde focar, por loja e só por produto e categoria.

.DESCRIPTION
  Lê o armazém de vendas deste computador (relatórios já conferidos ao centavo, guardados pelo Agente.ps1), analisa a última semana
  completa de cada loja em paralelo (uma loja por núcleo) e grava o relatório em Documentos\Nova7 Relatórios\Inteligência\<loja>\.
  Não usa API de IA, não gasta token e não lê dado de cliente. Não publica no site: o Agente.ps1 já publica a mesma análise
  sempre que chega relatório novo (aba "Inteligência de vendas"). Use este script para fechar a semana na segunda-feira
  ou para analisar uma semana antiga.

.EXAMPLE
  .\Inteligencia.ps1                                   # todas as lojas, última semana completa
  .\Inteligencia.ps1 -Loja M                           # só a loja M
  .\Inteligencia.ps1 -Semana 2026-11-09                # uma semana antiga (a segunda-feira dela)
  .\Inteligencia.ps1 -Nome 'F=Farma e Farma','M=Minas Farma' -NaoAbrir
#>
[CmdletBinding()]
param(
  [string[]]$Loja = @(),                   # chaves das lojas do armazém (padrão: todas)
  [string]$Semana = '',                    # AAAA-MM-DD da segunda-feira (padrão: a última semana completa)
  [string[]]$Nome = @(),                   # chave=Nome da loja, para o título do relatório
  [string]$Saida = '',                     # pasta de saída (padrão: Documentos\Nova7 Relatórios\Inteligência)
  [int]$Nucleos = 0,                       # 0 = todos os núcleos
  [switch]$NaoAbrir
)
$ErrorActionPreference = 'Stop'
$aqui = $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js não encontrado no PATH (precisa da versão 20 ou mais nova).' }
$ver = [int](((node -v) -replace '^v', '') -split '\.')[0]
if ($ver -lt 20) { throw "Node $ver é antigo demais: use a versão 20 ou mais nova." }
if ($Semana -and $Semana -notmatch '^\d{4}-\d{2}-\d{2}$') { throw 'Use -Semana AAAA-MM-DD (a segunda-feira da semana).' }
$a = @()
foreach ($l in $Loja) { $a += @('--loja', $l) }
foreach ($n in $Nome) { $a += @('--nome', $n) }
if ($Semana) { $a += @('--semana', $Semana) }
if ($Saida) { $a += @('--saida', $Saida) }
if ($Nucleos -gt 0) { $a += @('--nucleos', $Nucleos) }
node (Join-Path $aqui 'inteligencia-cli.js') @a
$cod = $LASTEXITCODE
if ($cod -eq 4) { Write-Warning 'Nenhuma loja tem semanas completas suficientes para comparar. Continue alimentando os relatórios de vendas.' }
elseif ($cod -ne 0) { throw 'A Inteligência de vendas falhou (veja a mensagem acima).' }
elseif (-not $NaoAbrir) {
  $docs = if (Test-Path (Join-Path $HOME 'Documents')) { Join-Path $HOME 'Documents' } else { Join-Path $HOME '.nova7' }
  $dir = if ($Saida) { $Saida } elseif ($env:N7_RELATORIOS) { Join-Path $env:N7_RELATORIOS 'Inteligência' } else { Join-Path $docs 'Nova7 Relatórios\Inteligência' }
  $u = Get-ChildItem -Path $dir -Filter 'ultima.md' -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($u) { Invoke-Item $u.FullName }
}
exit $cod
