# sync-plugin.ps1 — 把本目录（唯一源码）同步到 DSH 线上插件装载目录
# 用法：pwsh -File sync-plugin.ps1           # 同步
#       pwsh -File sync-plugin.ps1 -Check    # 只比对，不写入
param([switch]$Check)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$src = Split-Path -Parent $MyInvocation.MyCommand.Path
$dst = Join-Path $env:USERPROFILE '.dsh\profiles\web\plugins\dsh-task-flow'
if (-not (Test-Path $dst)) { throw "线上插件目录不存在: $dst" }
$items = @('lib', 'test', 'package.json', 'README.md', 'LICENSE', '.gitignore')

function HashDir($d) {
  $files = Get-ChildItem $d -Recurse -File -ErrorAction SilentlyContinue | Sort-Object FullName
  return (($files | ForEach-Object { (Get-FileHash $_.FullName -Algorithm MD5).Hash + '|' + $_.FullName.Replace($d, '') }) -join "`n")
}

if ($Check) {
  foreach ($it in $items) {
    $s = Join-Path $src $it; $d = Join-Path $dst $it
    if ((Test-Path $s -PathType Container) -and (Test-Path $d -PathType Container)) {
      $same = (HashDir $s) -eq (HashDir $d)
      "$it : $(if ($same) { '一致' } else { '不同' })"
    } elseif (Test-Path $s -PathType Leaf) {
      $same = (Test-Path $d) -and ((Get-FileHash $s -Algorithm MD5).Hash -eq (Get-FileHash $d -Algorithm MD5).Hash)
      "$it : $(if ($same) { '一致' } else { '不同/缺失' })"
    }
  }
  exit 0
}

foreach ($it in $items) {
  $s = Join-Path $src $it; $d = Join-Path $dst $it
  if (Test-Path $s -PathType Container) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
    # 镜像同步：清掉目标目录内的旧文件（保留 .git 目录与其它隐藏项），再整体复制
    Get-ChildItem $d -File -Force -ErrorAction SilentlyContinue | Remove-Item -Force
    Copy-Item -Path (Join-Path $s '*') -Destination $d -Recurse -Force
  } elseif (Test-Path $s -PathType Leaf) {
    Copy-Item $s $d -Force
  }
}
'SYNC_DONE ' + $src + ' -> ' + $dst
