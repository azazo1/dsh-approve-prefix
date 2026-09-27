# 从 stdin 读 pwsh 命令原文, 只 ParseInput, 打印 AST 摘要 JSON, 不执行命令.
$ErrorActionPreference = 'Stop'

function Write-Summary {
  param(
    [string[]]$Errors,
    [int]$StatementCount,
    [string]$StatementType,
    [int]$PipelineCount,
    [string]$Invocation,
    [int]$Redirections,
    [object[]]$Elements
  )
  $payload = [pscustomobject]@{
    errors = @($Errors)
    statementCount = $StatementCount
    statementType = $StatementType
    pipelineCount = $PipelineCount
    invocation = $Invocation
    redirections = $Redirections
    elements = @($Elements)
  }
  [Console]::Out.Write(($payload | ConvertTo-Json -Compress -Depth 6))
}

try {
  $command = [Console]::In.ReadToEnd()
  $tokens = $null
  $parseErrors = $null
  $ast = [System.Management.Automation.Language.Parser]::ParseInput($command, [ref]$tokens, [ref]$parseErrors)

  $errorMessages = @()
  foreach ($err in @($parseErrors)) {
    $errorMessages += [string]$err.Message
  }

  $statements = @()
  if ($null -ne $ast.EndBlock) {
    $statements = @($ast.EndBlock.Statements)
  }

  $statementType = ''
  $pipelineCount = 0
  $invocation = ''
  $redirections = 0
  $elements = @()

  if ($statements.Count -eq 1) {
    $statement = $statements[0]
    $statementType = $statement.GetType().Name
    $redirections += @($statement.Redirections).Count
    if ($statement -is [System.Management.Automation.Language.PipelineAst]) {
      $pipelineCount = @($statement.PipelineElements).Count
      $commandAst = $statement.PipelineElements[0]
      if ($pipelineCount -eq 1 -and $commandAst -is [System.Management.Automation.Language.CommandAst]) {
        $invocation = [string]$commandAst.InvocationOperator
        $redirections += @($commandAst.Redirections).Count
        foreach ($element in @($commandAst.CommandElements)) {
          $value = ''
          if ($null -ne $element.PSObject.Properties['Value']) {
            $value = [string]$element.Value
          }
          $elements += [pscustomobject]@{
            type = $element.GetType().Name
            value = $value
          }
        }
      }
    }
  }

  Write-Summary -Errors $errorMessages -StatementCount $statements.Count -StatementType $statementType -PipelineCount $pipelineCount -Invocation $invocation -Redirections $redirections -Elements $elements
} catch {
  $message = [string]$_.Exception.Message
  Write-Summary -Errors @($message) -StatementCount 0 -StatementType '' -PipelineCount 0 -Invocation '' -Redirections 0 -Elements @()
}
