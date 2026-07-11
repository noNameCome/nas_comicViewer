@echo off
cd /d "%~dp0"
set "RES=android\app\src\main\res"
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"

echo ======================================
echo  Manga Viewer APK Build (2 versions)
echo ======================================
echo.

echo [1/7] Resizing icon image...
python "icon_variants\gen_icon.py"
if errorlevel 1 (
    echo ICON RESIZE FAILED
    pause
    exit /b 1
)

echo [2/7] Applying basic icon...
for %%D in (mdpi hdpi xhdpi xxhdpi xxxhdpi) do (
    copy /y "icon_variants\basic\mipmap-%%D\ic_launcher.png" "%RES%\mipmap-%%D\ic_launcher.png" >nul
    copy /y "icon_variants\basic\mipmap-%%D\ic_launcher_round.png" "%RES%\mipmap-%%D\ic_launcher_round.png" >nul
    copy /y "icon_variants\basic\mipmap-%%D\ic_launcher_foreground.png" "%RES%\mipmap-%%D\ic_launcher_foreground.png" >nul
)

echo [3/7] Syncing and building basic-icon APK...
call npx cap sync android
if errorlevel 1 (
    echo SYNC FAILED
    pause
    exit /b 1
)
cd android
call "%cd%\gradlew.bat" assembleRelease
if errorlevel 1 (
    echo BUILD FAILED
    cd ..
    pause
    exit /b 1
)
cd ..
copy /y "android\app\build\outputs\apk\release\app-release.apk" "manga_viewer_basic_icon.apk" >nul

echo [4/7] Applying custom icon...
for %%D in (mdpi hdpi xhdpi xxhdpi xxxhdpi) do (
    copy /y "icon_variants\custom\mipmap-%%D\ic_launcher.png" "%RES%\mipmap-%%D\ic_launcher.png" >nul
    copy /y "icon_variants\custom\mipmap-%%D\ic_launcher_round.png" "%RES%\mipmap-%%D\ic_launcher_round.png" >nul
    copy /y "icon_variants\custom\mipmap-%%D\ic_launcher_foreground.png" "%RES%\mipmap-%%D\ic_launcher_foreground.png" >nul
)

echo [5/7] Syncing and building custom-icon APK...
call npx cap sync android
if errorlevel 1 (
    echo SYNC FAILED
    pause
    exit /b 1
)
cd android
call "%cd%\gradlew.bat" assembleRelease
if errorlevel 1 (
    echo BUILD FAILED
    cd ..
    pause
    exit /b 1
)
cd ..
copy /y "android\app\build\outputs\apk\release\app-release.apk" "manga_viewer_custom_icon.apk" >nul

echo [6/7] Done building both versions.
echo [7/7] Opening folder...
echo.
echo Build complete:
echo   manga_viewer_basic_icon.apk
echo   manga_viewer_custom_icon.apk
explorer /select,"manga_viewer_custom_icon.apk"
pause
