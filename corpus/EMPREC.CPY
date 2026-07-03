      *****************************************************************
      * EMPREC - EMPLOYEE MASTER HOST VARIABLES                       *
      * MATCHES PAYROLL.EMP_MASTER (DB2). DO NOT WIDEN EMP-NAME       *
      * WITHOUT REBINDING PAYRPT04 AND THE 1999 EXTRACT JOB.          *
      *****************************************************************
       01  EMP-MASTER-REC.
           05 EMP-NO           PIC 9(6).
           05 EMP-NAME         PIC X(28).
           05 EMP-GRADE        PIC X(2).
      *       HIRE-DATE IS YYMMDD. TWO-DIGIT YEAR (SEE PIVOT 66).
           05 EMP-HIRE-DATE    PIC X(6).
           05 EMP-UNION-FLAG   PIC X.
           05 EMP-PEN-OPTOUT   PIC X.
           05 EMP-NIGHT-ELIG   PIC X.
           05 EMP-DEPT         PIC X(4).
      *       FIELD BELOW IS DEAD SINCE 2008 LUNCHEON VOUCHER SUNSET
      *       BUT PAYRPT04 STILL READS ITS OFFSET. KEEP.
           05 EMP-LV-BAND      PIC X.
