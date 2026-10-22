Add-Type -AssemblyName System.Speech
$job=Get-Content -LiteralPath $env:SCORELER_SPEECH_INPUT -Raw -Encoding UTF8 | ConvertFrom-Json
$synth=New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice=$synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name.StartsWith($job.language.Split('-')[0]) } | Select-Object -First 1
if(-not $voice){$synth.Dispose();exit 2}
$synth.SelectVoice($voice.VoiceInfo.Name)
foreach($scene in $job.scenes){$synth.SetOutputToWaveFile($scene.file);$synth.Speak([string]$scene.text);$synth.SetOutputToNull()}
$synth.Dispose()
