#define MyAppName "Followcast"
#ifndef MyAppVersion
  #define MyAppVersion "0.5.1"
#endif
#define MyAppPublisher "itz4blitz"
#define MyAppURL "https://github.com/itz4blitz/followcast"
#define MyAppExeName "followcast.exe"
#ifndef StageDir
  #define StageDir "..\..\build\win-stage"
#endif

[Setup]
AppId={{7B4F6C2A-8B51-4F27-9D1C-5E4B2F93A104}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/issues
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={localappdata}\Programs\followcast
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\..\build
OutputBaseFilename=followcast-setup-x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ChangesEnvironment=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Tasks]
Name: "addtopath"; Description: "Add Followcast to your user PATH"; Flags: checkedonce
Name: "autostart"; Description: "Launch Followcast when you sign in to Windows"; Flags: unchecked

[Files]
Source: "{#StageDir}\followcast.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\win32_desktop.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\win32_surface.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StageDir}\README.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Followcast"; ValueData: """{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[Code]
const
  EnvKey = 'Environment';

procedure AddToUserPath(Dir: string);
var
  Paths: string;
begin
  if not RegQueryStringValue(HKCU, EnvKey, 'Path', Paths) then
    Paths := '';
  if Pos(';' + Uppercase(Dir) + ';', ';' + Uppercase(Paths) + ';') > 0 then
    exit;
  if (Length(Paths) > 0) and (Paths[Length(Paths)] <> ';') then
    Paths := Paths + ';';
  Paths := Paths + Dir;
  RegWriteExpandStringValue(HKCU, EnvKey, 'Path', Paths);
end;

procedure RemoveFromUserPath(Dir: string);
var
  Paths, UpperPaths, Target: string;
  P: Integer;
begin
  if not RegQueryStringValue(HKCU, EnvKey, 'Path', Paths) then
    exit;
  UpperPaths := ';' + Uppercase(Paths) + ';';
  Target := ';' + Uppercase(Dir) + ';';
  P := Pos(Target, UpperPaths);
  if P = 0 then
    exit;
  Delete(Paths, P, Length(Dir) + 1);
  if (Length(Paths) > 0) and (Paths[Length(Paths)] = ';') then
    Delete(Paths, Length(Paths), 1);
  RegWriteExpandStringValue(HKCU, EnvKey, 'Path', Paths);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep = ssPostInstall) and WizardIsTaskSelected('addtopath') then
    AddToUserPath(ExpandConstant('{app}'));
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    RemoveFromUserPath(ExpandConstant('{app}'));
end;
