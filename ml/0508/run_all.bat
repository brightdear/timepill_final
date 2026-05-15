@echo off
REM ============================================================
REM  run_all.bat  --  로컬 PC에서 전체 파이프라인 실행
REM
REM  실행 전 config.bat 에서 경로/파라미터를 설정하세요.
REM
REM  순서:
REM    Step 1. 하드 네거티브 캐시 생성 (증분, 이미 처리된 이미지는 건너뜀)
REM    Step 2. 데이터셋 빌드 (실제 + 합성 + 하드 네거티브)
REM    Step 3. 학습 실행
REM ============================================================

SETLOCAL

REM -- 설정 로드 --
CALL "%~dp0config.bat"

REM -- Python 명령 (venv 활성화 하려면 PYTHON_EXE 경로를 맞게 수정) --
SET PYTHON_EXE=python

echo.
echo ============================================================
echo  timepill ml/0508 -- 로컬 학습 파이프라인
echo ============================================================
echo  DATA_ROOT      = %DATA_ROOT%
echo  OUTPUT_ROOT    = %OUTPUT_ROOT%
echo  TRAIN_PROJECT  = %TRAIN_PROJECT%
echo  TRAIN_NAME     = %TRAIN_NAME%
echo  SCRIPTS_DIR    = %SCRIPTS_DIR%
echo ============================================================
echo.

REM ---- Step 1: 하드 네거티브 캐시 생성 ----
echo [Step 1] 하드 네거티브 캐시 생성 중...
%PYTHON_EXE% "%SCRIPTS_DIR%\augment_hard_negatives_cache.py" ^
    --hard-negatives-dir "%DATA_ROOT%\hard_negatives" ^
    --cache-dir "%HARD_NEG_CACHE%" ^
    --crops-per-image %CROPS_PER_IMAGE% ^
    --seed %SEED%

IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo [오류] Step 1 실패. 스크립트를 확인하세요.
    GOTO :END
)

echo.
echo [Step 1 완료]
echo.

REM ---- Step 2: 데이터셋 빌드 ----
echo [Step 2] 데이터셋 빌드 중...
%PYTHON_EXE% "%SCRIPTS_DIR%\build_real_prototype_dataset.py" ^
    --real-root "%DATA_ROOT%" ^
    --output-root "%OUTPUT_ROOT%" ^
    --synthetic-target %SYNTHETIC_TARGET% ^
    --copy-hard-negatives ^
    --hard-negative-cache-dir "%HARD_NEG_CACHE%" ^
    --synthetic-cache-dir "%SYNTHETIC_CACHE%" ^
    --seed %SEED%

IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo [오류] Step 2 실패. 스크립트를 확인하세요.
    GOTO :END
)

echo.
echo [Step 2 완료]
echo.

REM ---- Step 3: 학습 실행 ----
echo [Step 3] 학습 실행 중...
%PYTHON_EXE% "%~dp0train_local.py" ^
    --data "%OUTPUT_ROOT%\dataset.yaml" ^
    --project "%TRAIN_PROJECT%" ^
    --name "%TRAIN_NAME%" ^
    --epochs %EPOCHS% ^
    --imgsz %IMGSZ% ^
    --batch %BATCH% ^
    --device %DEVICE% ^
    --workers %WORKERS% ^
    --seed %SEED% ^
    --patience %PATIENCE% ^
    --save-period %SAVE_PERIOD% ^
    --close-mosaic %CLOSE_MOSAIC%

IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo [오류] Step 3 실패. 학습 로그를 확인하세요.
    GOTO :END
)

echo.
echo ============================================================
echo  전체 파이프라인 완료!
echo  결과물: %TRAIN_PROJECT%\%TRAIN_NAME%\weights\best.pt
echo ============================================================

:END
ENDLOCAL
