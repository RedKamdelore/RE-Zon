!macro customInit
  ${If} ${isUpdated}
    SetSilent silent
  ${EndIf}
!macroend

!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.RezonProfilePage un.RezonProfileLeave
  Var rezonProfileCheckbox
  Var rezonDeleteProfile

  Function un.RezonProfilePage
    StrCpy $rezonDeleteProfile "0"
    ${If} ${isUpdated}
      Abort
    ${EndIf}
    ${If} ${Silent}
      Abort
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "Данные Re:Zon" "Выберите, сохранить ли профиль на этом компьютере."
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 48u "По умолчанию настройки, плейлисты и входы в сервисы сохраняются для повторной установки. Обновление приложения всегда сохраняет профиль."
    Pop $0
    ${NSD_CreateCheckbox} 0 58u 100% 28u "Удалить также настройки, коллекцию и входы в аккаунты"
    Pop $rezonProfileCheckbox
    ${NSD_Uncheck} $rezonProfileCheckbox
    ${NSD_CreateLabel} 0 98u 100% 42u "Будет удалён профиль Re:Zon текущего пользователя Windows. Музыкальные файлы вне папки профиля останутся. Удаление данных нельзя отменить."
    Pop $0
    nsDialogs::Show
  FunctionEnd

  Function un.RezonProfileLeave
    ${NSD_GetState} $rezonProfileCheckbox $rezonDeleteProfile
  FunctionEnd
!macroend

!macro customUnInstall
  ${IfNot} ${isUpdated}
  ${AndIfNot} ${Silent}
  ${AndIf} $rezonDeleteProfile == ${BST_CHECKED}
    SetShellVarContext current
    ${If} $APPDATA != ""
      ClearErrors
      RMDir /r "$APPDATA\rezon"
      ${If} ${Errors}
        MessageBox MB_OK|MB_ICONEXCLAMATION "Не удалось полностью удалить профиль Re:Zon. Закройте процессы приложения и проверьте папку $APPDATA\rezon."
      ${EndIf}
    ${EndIf}
    ${If} $installMode == "all"
      SetShellVarContext all
    ${EndIf}
  ${EndIf}
!macroend
