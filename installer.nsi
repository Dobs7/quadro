; Instalador por usuário. /S /EXTRACTONLY /D=pasta extrai sem criar atalhos ou registro.
Unicode true
!include "MUI2.nsh"
!include "FileFunc.nsh"
Name "Quadro"
OutFile "..\build\Quadro-Instalador-1.0.1.exe"
InstallDir "$LOCALAPPDATA\Programs\Quadro"
RequestExecutionLevel user
SetCompressor zlib
VIProductVersion "1.0.1.0"
VIAddVersionKey /LANG=1046 "ProductName" "Quadro"
VIAddVersionKey /LANG=1046 "ProductVersion" "1.0.1"
VIAddVersionKey /LANG=1046 "FileVersion" "1.0.1"
VIAddVersionKey /LANG=1046 "CompanyName" "Dobs by Azura"
VIAddVersionKey /LANG=1046 "FileDescription" "Instalador Quadro"
VIAddVersionKey /LANG=1046 "LegalCopyright" "Copyright © 2026 Dobs by Azura. Créditos de terceiros preservados."
VIAddVersionKey /LANG=1046 "Comments" "Criado por Dobs by Azura"
!define MUI_ICON "quadro.ico"
!define MUI_UNICON "quadro.ico"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"
Var ExtractOnly
Function .onInit
 StrCpy $ExtractOnly 0
 ${GetParameters} $R0
 ClearErrors
 ${GetOptions} $R0 "/EXTRACTONLY" $R1
 IfErrors normal
 StrCpy $ExtractOnly 1
 SetSilent silent
 normal:
FunctionEnd
Section "Aplicativo"
 SetOutPath "$INSTDIR"
 File /r "..\build\win-unpacked\*.*"
 StrCmp $ExtractOnly 1 done
 CreateDirectory "$SMPROGRAMS\Quadro"
 CreateShortcut "$SMPROGRAMS\Quadro\Quadro.lnk" "$INSTDIR\Quadro.exe"
 CreateShortcut "$DESKTOP\Quadro.lnk" "$INSTDIR\Quadro.exe"
 WriteUninstaller "$INSTDIR\Desinstalar.exe"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Quadro" "DisplayName" "Quadro"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Quadro" "DisplayVersion" "1.0.1"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Quadro" "Publisher" "Dobs by Azura"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Quadro" "InstallLocation" "$INSTDIR"
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Quadro" "UninstallString" '"$INSTDIR\Desinstalar.exe"'
 WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Quadro" "DisplayIcon" "$INSTDIR\Quadro.exe"
 done:
SectionEnd
Section "Uninstall"
 Delete "$DESKTOP\Quadro.lnk"
 Delete "$SMPROGRAMS\Quadro\Quadro.lnk"
 RMDir "$SMPROGRAMS\Quadro"
 RMDir /r "$INSTDIR"
 DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Quadro"
SectionEnd
