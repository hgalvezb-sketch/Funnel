@echo off
chcp 65001 >nul
echo ============================================================
echo  Limpieza de scripts de inicio de Windows
echo ============================================================
echo.

set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"

echo Buscando archivos en: %STARTUP%
echo.

set FOUND=0

for %%f in ("%STARTUP%\*servidor_edo_cuenta*") do (
    echo  Eliminando: %%~nxf
    del "%%f"
    set FOUND=1
)

for %%f in ("%STARTUP%\*EdoCuenta*") do (
    echo  Eliminando: %%~nxf
    del "%%f"
    set FOUND=1
)

for %%f in ("%STARTUP%\*Claude_Usage_Monitor*") do (
    echo  Eliminando: %%~nxf
    del "%%f"
    set FOUND=1
)

for %%f in ("%STARTUP%\*claude_usage*") do (
    echo  Eliminando: %%~nxf
    del "%%f"
    set FOUND=1
)

echo.
if %FOUND%==1 (
    echo  Listo! Los archivos de inicio fueron eliminados.
    echo  Reinicia tu PC para confirmar que los errores desaparecieron.
) else (
    echo  No se encontraron archivos relacionados.
    echo  Revisa manualmente la carpeta de Startup:
    echo  Presiona Win+R, escribe shell:startup y presiona Enter.
    explorer "%STARTUP%"
)

echo.
echo ============================================================
pause
