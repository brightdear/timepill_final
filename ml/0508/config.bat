@echo off
REM ============================================================
REM  config.bat  --  ml/0508 로컬 학습 설정
REM  이 파일만 수정하면 run_all.bat 이 알아서 맞춰 돌아갑니다.
REM ============================================================

REM --- 데이터 루트 (Drive 공유받은 폴더를 로컬에 복사한 경로) ---
REM  아래 구조를 가져야 합니다:
REM    DATA_ROOT\
REM      pill.yolov8\          <- 라벨링된 실제 알약 이미지
REM      sample_img\           <- 알약 컷아웃 이미지
REM      backgrounds\          <- 배경 이미지
REM      hard_negatives\       <- 하드 네거티브 이미지
SET DATA_ROOT=C:\timepill_data

REM --- 산출물 루트 (데이터셋 빌드 결과 저장 위치) ---
SET OUTPUT_ROOT=C:\timepill_runs\datasets\pill_prototype_0508

REM --- 학습 결과 저장 위치 ---
SET TRAIN_PROJECT=C:\timepill_runs\runs

REM --- 학습 결과 폴더 이름 ---
SET TRAIN_NAME=pill_prototype_0508_v1

REM --- 하드 네거티브 캐시 저장 위치 (증분 처리, 재실행 시 빠름) ---
SET HARD_NEG_CACHE=C:\timepill_runs\hard_negative_cache_aug

REM --- 합성 이미지 캐시 저장 위치 ---
SET SYNTHETIC_CACHE=C:\timepill_runs\synthetic_cache

REM --- 0422 폴더 경로 (Python 스크립트 위치) ---
SET SCRIPTS_DIR=%~dp0..\0422

REM --- 학습 파라미터 ---
SET EPOCHS=200
SET IMGSZ=640
SET BATCH=16
SET DEVICE=0
SET WORKERS=4
SET SEED=42
SET PATIENCE=40
SET SAVE_PERIOD=25
SET CLOSE_MOSAIC=20

REM --- 합성 이미지 목표 수 ---
SET SYNTHETIC_TARGET=500

REM --- 이미지당 하드 네거티브 증강 크롭 수 ---
SET CROPS_PER_IMAGE=3
