param(
  [Parameter(Mandatory = $true)]
  [string]$ArtifactDirectory,
  [Parameter(Mandatory = $true)]
  [string]$CertificateOutput
)

$ErrorActionPreference = 'Stop'
$certificate = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject 'CN=Astraluster' `
  -CertStoreLocation 'Cert:\CurrentUser\My' `
  -KeyExportPolicy Exportable `
  -HashAlgorithm SHA256 `
  -NotAfter (Get-Date).AddYears(5)

Export-Certificate -Cert $certificate -FilePath $CertificateOutput -Force | Out-Null

$artifacts = Get-ChildItem -LiteralPath $ArtifactDirectory -Recurse -Filter '*.exe' -File
if ($artifacts.Count -eq 0) {
  throw "No Windows executables found in $ArtifactDirectory"
}

foreach ($artifact in $artifacts) {
  $signature = Set-AuthenticodeSignature -FilePath $artifact.FullName -Certificate $certificate
  if ($signature.SignerCertificate -eq $null) {
    throw "Could not write a signature to $($artifact.FullName): $($signature.StatusMessage)"
  }
  $verified = Get-AuthenticodeSignature -FilePath $artifact.FullName
  if ($verified.SignerCertificate.Subject -ne 'CN=Astraluster') {
    throw "Unexpected publisher for $($artifact.FullName)"
  }
}
