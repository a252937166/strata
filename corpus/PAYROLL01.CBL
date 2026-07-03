      *****************************************************************
      * PAYROLL01 - WEEKLY PAYROLL CALCULATION - NORTHFIELD MFG LTD    *
      *---------------------------------------------------------------*
      * AUTHOR. D.HARGREAVES.        ORIGINAL: 04 MAR 1987             *
      * REWRITE FOR DB2              R.OKAFOR  11 NOV 1999             *
      * DO NOT CHANGE PARA 400-TAX WITHOUT RING PENSIONS DESK X4471    *
      * JT 03/91  FIX ROUNDING ON OT  (SEE MEMO 91/114)                *
      * SB 07/96  SUNDAY RATE NOW X2  (UNION AGREEMENT 96/2)           *
      * RO 11/99  Y2K WINDOWING ON HIRE-DATE, PIVOT 66                 *
      * MG 02/04  GRADE G6/G7 ADDED FOR DEPOT SUPERVISORS              *
      * ?? 09/11  EMERGENCY TAX PATCH - TEMPORARY (STILL LIVE 2026)    *
      *****************************************************************
       IDENTIFICATION DIVISION.
       PROGRAM-ID. PAYROLL01.
       ENVIRONMENT DIVISION.
       INPUT-OUTPUT SECTION.
       FILE-CONTROL.
           SELECT TIMECARD-FILE ASSIGN TO TIMECARD
               ORGANIZATION IS SEQUENTIAL.
           SELECT PAYSLIP-FILE  ASSIGN TO PAYSLIP
               ORGANIZATION IS SEQUENTIAL.
           SELECT EXCEPTION-RPT ASSIGN TO EXCPRPT
               ORGANIZATION IS SEQUENTIAL.

       DATA DIVISION.
       FILE SECTION.
       FD  TIMECARD-FILE.
       01  TIMECARD-REC.
           05 TC-EMP-NO        PIC 9(6).
           05 TC-WEEK-NO       PIC 9(2).
           05 TC-HOURS-MON     PIC 9(2)V9.
           05 TC-HOURS-TUE     PIC 9(2)V9.
           05 TC-HOURS-WED     PIC 9(2)V9.
           05 TC-HOURS-THU     PIC 9(2)V9.
           05 TC-HOURS-FRI     PIC 9(2)V9.
           05 TC-HOURS-SAT     PIC 9(2)V9.
           05 TC-HOURS-SUN     PIC 9(2)V9.
           05 TC-NIGHT-FLAG    PIC X.
           05 TC-SICK-DAYS     PIC 9.

       FD  PAYSLIP-FILE.
       01  PAYSLIP-REC         PIC X(132).

       FD  EXCEPTION-RPT.
       01  EXCEPTION-REC       PIC X(132).

       WORKING-STORAGE SECTION.
       COPY EMPREC.

       01  WS-CONSTANTS.
      *    STANDARD WEEK PER 1987 WORKS COUNCIL AGREEMENT
           05 WS-STD-WEEK      PIC 9(2)V9  VALUE 37.5.
      *    OT CAP RAISED 15->20 HRS, MEMO 02/117
           05 WS-OT-CAP        PIC 9(2)    VALUE 20.
           05 WS-OT-MULT       PIC 9V99    VALUE 1.50.
           05 WS-SUN-MULT      PIC 9V99    VALUE 2.00.
      *    NIGHT DIFF 12 PCT - UNION AGREEMENT 96/2 CLAUSE 9
           05 WS-NIGHT-DIFF    PIC V99     VALUE .12.
           05 WS-UNION-DUES    PIC 9V99    VALUE 4.20.
      *    SSP FLAT DAILY RATE - DO NOT UPRATE HERE, SEE HR
           05 WS-SICK-DAILY    PIC 9(2)V99 VALUE 23.35.

       01  WS-GRADE-TABLE.
      *    BASE HOURLY RATES BY GRADE - LAST UPRATED 04/2019 (!)
           05 WS-GRADE-ENTRY OCCURS 7 TIMES.
              10 WS-GRADE-CODE  PIC X(2).
              10 WS-GRADE-RATE  PIC 9(2)V99.
       01  WS-GRADE-INIT.
           05 FILLER PIC X(6) VALUE 'G1 984'.
           05 FILLER PIC X(6) VALUE 'G21075'.
           05 FILLER PIC X(6) VALUE 'G31190'.
           05 FILLER PIC X(6) VALUE 'G41320'.
           05 FILLER PIC X(6) VALUE 'G51475'.
           05 FILLER PIC X(6) VALUE 'G61710'.
           05 FILLER PIC X(6) VALUE 'G71995'.

       01  WS-TAX-BANDS.
      *    WEEKLY PAYE BANDS. HARDCODED SINCE 2009 "TEMPORARY" PATCH.
      *    BAND1 UP TO 242.00 -> 0 PCT   (PERSONAL ALLOWANCE /52)
      *    BAND2 UP TO 967.00 -> 20 PCT
      *    BAND3 ABOVE       -> 40 PCT
           05 WS-BAND1-LIM     PIC 9(4)V99 VALUE 242.00.
           05 WS-BAND2-LIM     PIC 9(4)V99 VALUE 967.00.
           05 WS-BAND2-RATE    PIC V99     VALUE .20.
           05 WS-BAND3-RATE    PIC V99     VALUE .40.
      *    NI: 8 PCT BETWEEN PT AND UEL, 2 PCT ABOVE. PT=242 UEL=967
           05 WS-NI-MAIN-RATE  PIC V99     VALUE .08.
           05 WS-NI-UPPER-RATE PIC V99     VALUE .02.

       01  WS-PENSION-RULES.
      *    AUTO-ENROL 2013: EE 5 PCT UNLESS OPT-OUT, ER 3 PCT
      *    GRADES G6+ LEGACY SCHEME: EE 6.5 PCT ER 9 PCT (CLOSED 2004)
           05 WS-PEN-EE-STD    PIC V999    VALUE .050.
           05 WS-PEN-EE-LEG    PIC V999    VALUE .065.
           05 WS-PEN-ER-STD    PIC V999    VALUE .030.
           05 WS-PEN-ER-LEG    PIC V999    VALUE .090.

       01  WS-WORK-FIELDS.
           05 WS-TOT-HOURS     PIC 9(3)V99 COMP-3.
           05 WS-WEEKDAY-HRS   PIC 9(3)V99 COMP-3.
           05 WS-SUN-HRS       PIC 9(2)V99 COMP-3.
           05 WS-OT-HRS        PIC 9(2)V99 COMP-3.
           05 WS-BASE-RATE     PIC 9(2)V99.
           05 WS-EFF-RATE      PIC 9(2)V999.
           05 WS-GROSS         PIC 9(5)V99 COMP-3.
           05 WS-BASIC-PAY     PIC 9(5)V99 COMP-3.
           05 WS-OT-PAY        PIC 9(5)V99 COMP-3.
           05 WS-SUN-PAY       PIC 9(5)V99 COMP-3.
           05 WS-SICK-PAY      PIC 9(4)V99 COMP-3.
           05 WS-BONUS         PIC 9(4)V99 COMP-3.
           05 WS-TAXABLE       PIC 9(5)V99 COMP-3.
           05 WS-TAX           PIC 9(5)V99 COMP-3.
           05 WS-NI            PIC 9(4)V99 COMP-3.
           05 WS-PEN-EE        PIC 9(4)V99 COMP-3.
           05 WS-PEN-ER        PIC 9(4)V99 COMP-3.
           05 WS-NET           PIC 9(5)V99 COMP-3.
           05 WS-SVC-YEARS     PIC 9(2).
           05 WS-HIRE-YY       PIC 9(2).
           05 WS-HIRE-YYYY     PIC 9(4).
           05 WS-IX            PIC 9.
           05 WS-EOF           PIC X VALUE 'N'.

       01  WS-RUN-TOTALS.
           05 WS-RUN-GROSS     PIC 9(7)V99 COMP-3 VALUE 0.
           05 WS-RUN-TAX       PIC 9(7)V99 COMP-3 VALUE 0.
           05 WS-RUN-COUNT     PIC 9(5)           VALUE 0.

           EXEC SQL INCLUDE SQLCA END-EXEC.

       PROCEDURE DIVISION.
       000-MAIN.
           PERFORM 050-INIT
           PERFORM UNTIL WS-EOF = 'Y'
               READ TIMECARD-FILE
                   AT END MOVE 'Y' TO WS-EOF
                   NOT AT END PERFORM 100-PROCESS-EMP
               END-READ
           END-PERFORM
           PERFORM 900-RUN-TOTALS
           STOP RUN.

       050-INIT.
           OPEN INPUT  TIMECARD-FILE
           OPEN OUTPUT PAYSLIP-FILE EXCEPTION-RPT
           MOVE WS-GRADE-INIT TO WS-GRADE-TABLE.

       100-PROCESS-EMP.
           EXEC SQL
               SELECT EMP_NAME, EMP_GRADE, HIRE_DATE,
                      UNION_FLAG, PENSION_OPTOUT, NIGHT_ELIGIBLE
               INTO :EMP-NAME, :EMP-GRADE, :EMP-HIRE-DATE,
                    :EMP-UNION-FLAG, :EMP-PEN-OPTOUT, :EMP-NIGHT-ELIG
               FROM PAYROLL.EMP_MASTER
               WHERE EMP_NO = :TC-EMP-NO
           END-EXEC
           IF SQLCODE NOT = 0
               PERFORM 800-EXCEPTION
           ELSE
               PERFORM 200-HOURS
               PERFORM 300-GROSS
               PERFORM 400-TAX THRU 400-TAX-EXIT
               PERFORM 500-DEDUCTIONS
               PERFORM 600-WRITE-SLIP
               PERFORM 700-POST-HISTORY
           END-IF.

       200-HOURS.
           COMPUTE WS-WEEKDAY-HRS = TC-HOURS-MON + TC-HOURS-TUE
               + TC-HOURS-WED + TC-HOURS-THU + TC-HOURS-FRI
               + TC-HOURS-SAT
           MOVE TC-HOURS-SUN TO WS-SUN-HRS
           COMPUTE WS-TOT-HOURS = WS-WEEKDAY-HRS + WS-SUN-HRS
      *    OT = WEEKDAY HOURS OVER STD WEEK. SUNDAY NEVER COUNTS
      *    TOWARD THE 37.5 TRIGGER (UNION AGREEMENT 96/2 CLAUSE 4)
           IF WS-WEEKDAY-HRS > WS-STD-WEEK
               COMPUTE WS-OT-HRS = WS-WEEKDAY-HRS - WS-STD-WEEK
           ELSE
               MOVE 0 TO WS-OT-HRS
           END-IF
      *    JT 03/91: CAP OT, EXCESS PAID AT FLAT RATE (MEMO 91/114)
           IF WS-OT-HRS > WS-OT-CAP
               MOVE WS-OT-CAP TO WS-OT-HRS
           END-IF.

       300-GROSS.
           PERFORM VARYING WS-IX FROM 1 BY 1 UNTIL WS-IX > 7
               IF WS-GRADE-CODE (WS-IX) = EMP-GRADE
                   MOVE WS-GRADE-RATE (WS-IX) TO WS-BASE-RATE
               END-IF
           END-PERFORM
      *    NIGHT SHIFT DIFFERENTIAL: RATE UPLIFT, NOT A LUMP SUM
           IF TC-NIGHT-FLAG = 'Y' AND EMP-NIGHT-ELIG = 'Y'
               COMPUTE WS-EFF-RATE ROUNDED =
                   WS-BASE-RATE * (1 + WS-NIGHT-DIFF)
           ELSE
               MOVE WS-BASE-RATE TO WS-EFF-RATE
           END-IF
           COMPUTE WS-BASIC-PAY ROUNDED =
               FUNCTION MIN (WS-WEEKDAY-HRS WS-STD-WEEK)
               * WS-EFF-RATE
           COMPUTE WS-OT-PAY ROUNDED =
               WS-OT-HRS * WS-EFF-RATE * WS-OT-MULT
           COMPUTE WS-SUN-PAY ROUNDED =
               WS-SUN-HRS * WS-EFF-RATE * WS-SUN-MULT
           COMPUTE WS-SICK-PAY ROUNDED =
               TC-SICK-DAYS * WS-SICK-DAILY
           PERFORM 350-SERVICE-BONUS
           COMPUTE WS-GROSS ROUNDED = WS-BASIC-PAY + WS-OT-PAY
               + WS-SUN-PAY + WS-SICK-PAY + WS-BONUS.

       350-SERVICE-BONUS.
      *    RO 11/99: TWO-DIGIT HIRE YEAR. PIVOT 66:
      *    YY >= 66 -> 19YY ELSE 20YY. BREAKS FOR HIRES AFTER 2065.
           MOVE EMP-HIRE-DATE (1:2) TO WS-HIRE-YY
           IF WS-HIRE-YY >= 66
               COMPUTE WS-HIRE-YYYY = 1900 + WS-HIRE-YY
           ELSE
               COMPUTE WS-HIRE-YYYY = 2000 + WS-HIRE-YY
           END-IF
           COMPUTE WS-SVC-YEARS = 2026 - WS-HIRE-YYYY
      *    LONG SERVICE: 10Y+ -> 2 PCT OF BASIC, 25Y+ -> 3.5 PCT
           EVALUATE TRUE
               WHEN WS-SVC-YEARS >= 25
                   COMPUTE WS-BONUS ROUNDED = WS-BASIC-PAY * .035
               WHEN WS-SVC-YEARS >= 10
                   COMPUTE WS-BONUS ROUNDED = WS-BASIC-PAY * .02
               WHEN OTHER
                   MOVE 0 TO WS-BONUS
           END-EVALUATE.

       400-TAX.
      *    ?? 09/11 EMERGENCY PATCH: PENSION EE CONTRIBUTION IS
      *    DEDUCTED BEFORE TAX (NET PAY ARRANGEMENT). DO NOT REORDER
      *    THESE PARAGRAPHS - 500-DEDUCTIONS DEPENDS ON WS-TAXABLE.
           PERFORM 550-PENSION
           COMPUTE WS-TAXABLE = WS-GROSS - WS-PEN-EE
           IF WS-TAXABLE <= WS-BAND1-LIM
               MOVE 0 TO WS-TAX
               GO TO 400-NI
           END-IF
           IF WS-TAXABLE <= WS-BAND2-LIM
               COMPUTE WS-TAX ROUNDED =
                   (WS-TAXABLE - WS-BAND1-LIM) * WS-BAND2-RATE
               GO TO 400-NI
           END-IF
           COMPUTE WS-TAX ROUNDED =
               (WS-BAND2-LIM - WS-BAND1-LIM) * WS-BAND2-RATE
             + (WS-TAXABLE - WS-BAND2-LIM) * WS-BAND3-RATE.

       400-NI.
      *    NI IGNORES PENSION (GROSS BASIS) - HISTORIC QUIRK KEPT
      *    FOR PARITY WITH 1999 REWRITE. FINANCE SIGNS THIS OFF
      *    EVERY AUDIT. SEE INCIDENT PR-2017-031.
           IF WS-GROSS <= WS-BAND1-LIM
               MOVE 0 TO WS-NI
           ELSE
               IF WS-GROSS <= WS-BAND2-LIM
                   COMPUTE WS-NI ROUNDED =
                       (WS-GROSS - WS-BAND1-LIM) * WS-NI-MAIN-RATE
               ELSE
                   COMPUTE WS-NI ROUNDED =
                       (WS-BAND2-LIM - WS-BAND1-LIM) * WS-NI-MAIN-RATE
                     + (WS-GROSS - WS-BAND2-LIM) * WS-NI-UPPER-RATE
               END-IF
           END-IF.
       400-TAX-EXIT.
           EXIT.

       500-DEDUCTIONS.
           COMPUTE WS-NET = WS-GROSS - WS-TAX - WS-NI - WS-PEN-EE
      *    UNION DUES FLAT 4.20/WK COLLECTED AT SOURCE (CHECKOFF)
           IF EMP-UNION-FLAG = 'Y'
               SUBTRACT WS-UNION-DUES FROM WS-NET
           END-IF
      *    NEGATIVE NET GUARD ADDED AFTER INCIDENT PR-2017-031
           IF WS-NET < 0
               MOVE 0 TO WS-NET
               PERFORM 800-EXCEPTION
           END-IF.

       550-PENSION.
      *    G6/G7 STAY ON CLOSED LEGACY SCHEME (2004 GRANDFATHER)
           IF EMP-PEN-OPTOUT = 'Y'
               MOVE 0 TO WS-PEN-EE
               MOVE 0 TO WS-PEN-ER
           ELSE
               IF EMP-GRADE = 'G6' OR EMP-GRADE = 'G7'
                   COMPUTE WS-PEN-EE ROUNDED = WS-GROSS * WS-PEN-EE-LEG
                   COMPUTE WS-PEN-ER ROUNDED = WS-GROSS * WS-PEN-ER-LEG
               ELSE
                   COMPUTE WS-PEN-EE ROUNDED = WS-GROSS * WS-PEN-EE-STD
                   COMPUTE WS-PEN-ER ROUNDED = WS-GROSS * WS-PEN-ER-STD
               END-IF
           END-IF.

       600-WRITE-SLIP.
           MOVE SPACES TO PAYSLIP-REC
           STRING TC-EMP-NO ' ' EMP-NAME ' GROSS ' WS-GROSS
                  ' TAX ' WS-TAX ' NI ' WS-NI
                  ' PEN ' WS-PEN-EE ' NET ' WS-NET
               DELIMITED BY SIZE INTO PAYSLIP-REC
           WRITE PAYSLIP-REC.

       700-POST-HISTORY.
           EXEC SQL
               INSERT INTO PAYROLL.PAY_HISTORY
                   (EMP_NO, WEEK_NO, GROSS, TAX, NI, PEN_EE, PEN_ER,
                    NET, RUN_DATE)
               VALUES (:TC-EMP-NO, :TC-WEEK-NO, :WS-GROSS, :WS-TAX,
                    :WS-NI, :WS-PEN-EE, :WS-PEN-ER, :WS-NET,
                    CURRENT DATE)
           END-EXEC
           ADD WS-GROSS TO WS-RUN-GROSS
           ADD WS-TAX   TO WS-RUN-TAX
           ADD 1        TO WS-RUN-COUNT.

       800-EXCEPTION.
           MOVE SPACES TO EXCEPTION-REC
           STRING 'EXCEPTION EMP ' TC-EMP-NO ' SQLCODE ' SQLCODE
               DELIMITED BY SIZE INTO EXCEPTION-REC
           WRITE EXCEPTION-REC.

       900-RUN-TOTALS.
           MOVE SPACES TO PAYSLIP-REC
           STRING 'RUN TOTALS: EMPS ' WS-RUN-COUNT
                  ' GROSS ' WS-RUN-GROSS ' TAX ' WS-RUN-TAX
               DELIMITED BY SIZE INTO PAYSLIP-REC
           WRITE PAYSLIP-REC
           CLOSE TIMECARD-FILE PAYSLIP-FILE EXCEPTION-RPT.
