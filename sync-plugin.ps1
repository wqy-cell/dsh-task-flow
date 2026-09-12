# sync-plugin.ps1 — 把本目录（唯一源码）同步到 DSH 线上插件装载目录
# 用法：pwsh -File sync-plugin.ps1           # 同步
#       pwsh -File sync-plugin.ps1 -Check    # 只比对，不写入
# 注意：DSH 实际从 node_modules 副本加载插件（pnpm file: 依赖），plugins/ 目录只是源；
#       两处都要同步，否则会出现「改了代码不生效」的假象。
param([switch]$Check)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$src = Split-Path -Parent $MyInvocation.MyCommand.Path
$dstDirs = @(
  (Join-Path $env:USERPROFILE '.dsh\profiles\web\plugins\dsh-task-flow'),
  (Join-Path $env:USERPROFILE '.dsh\profiles\web\node_modules\dsh-task-flow')
)
$items = @('lib', 'test', 'package.json', 'README.md', 'LICENSE', '.gitignore')

function HashDir($d) {
  $files = Get-ChildItem $d -Recurse -File -ErrorAction SilentlyContinue | Sort-Object FullName
  return (($files | ForEach-Object { (Get-FileHash $_.FullName -Algorithm MD5).Hash + '|' + $_.FullName.Replace($d, '') }) -join "`n")
}

if ($Check) {
  foreach ($dst in $dstDirs) {
    "== 目标：$($dst.Replace($env:USERPROFILE, '~')) =="
    if (-not (Test-Path $dst)) { "  （目录不存在）"; continue }
    foreach ($it in $items) {
      $s = Join-Path $src $it; $d = Join-Path $dst $it
      if ((Test-Path $s -PathType Container) -and (Test-Path $d -PathType Container)) {
        $same = (HashDir $s) -eq (HashDir $d)
        "  $it : $(if ($same) { '一致' } else { '不同' })"
      } elseif (Test-Path $s -PathType Leaf) {
        $same = (Test-Path $d) -and ((Get-FileHash $s -Algorithm MD5).Hash -eq (Get-FileHash $d -Algorithm MD5).Hash)
        "  $it : $(if ($same) { '一致' } else { '不同/缺失' })"
      }
    }
  }
  exit 0
}

foreach ($dst in $dstDirs) {
  if (-not (Test-Path $dst)) { New-Item -ItemType Directory -Path $dst -Force | Out-Null }
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
  "SYNC_DONE $src -> $dst"
}
