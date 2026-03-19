-- HonvéD – Honvédségi Digitális Adminisztrációs Rendszer
-- MySQL séma – minden tábla és kapcsolat

CREATE DATABASE IF NOT EXISTS honved CHARACTER SET utf8mb4 COLLATE utf8mb4_hungarian_ci;
USE honved;

-- ──────────────────────────────────────────────
--  1. SZEMÉLYI ÁLLOMÁNY
-- ──────────────────────────────────────────────
CREATE TABLE szemely (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    nev                 VARCHAR(100) NOT NULL,
    rendfokozat         VARCHAR(50)  NOT NULL,
    alakulat            VARCHAR(100) NOT NULL,
    statusz             ENUM('aktív','tartalékos','leszerelt','szabadságon') NOT NULL DEFAULT 'aktív',
    email               VARCHAR(150),
    telefon             VARCHAR(30),
    szolgalat_kezdete   DATE,
    megjegyzes          TEXT,
    letrehozva          DATETIME DEFAULT CURRENT_TIMESTAMP,
    modositva           DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────────
--  2. FELHASZNÁLÓK ÉS SZEREPKÖRÖK
-- ──────────────────────────────────────────────
CREATE TABLE felhasznalo (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    szemely_id          INT NOT NULL,
    felhasznalonev      VARCHAR(80) NOT NULL UNIQUE,
    jelszo_hash         VARCHAR(255) NOT NULL,
    szerepkor           ENUM('parancsnok','adminisztrator','felhasznalo') NOT NULL DEFAULT 'felhasznalo',
    aktiv               BOOLEAN DEFAULT TRUE,
    utolso_belepes      DATETIME,
    FOREIGN KEY (szemely_id) REFERENCES szemely(id) ON DELETE CASCADE
);

-- ──────────────────────────────────────────────
--  3. BEOSZTÁSOK (kiképzések, gyakorlatok)
-- ──────────────────────────────────────────────
CREATE TABLE beosztas (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    nev                 VARCHAR(150) NOT NULL,
    tipus               ENUM('kiképzés','gyakorlat','szolgálat','rendezvény','egyéb') NOT NULL,
    kezdete             DATE NOT NULL,
    vege                DATE NOT NULL,
    helyszin            VARCHAR(200),
    leiras              TEXT,
    letrehozva          DATETIME DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_datum CHECK (vege >= kezdete)
);

-- ──────────────────────────────────────────────
--  4. BEOSZTÁS–SZEMÉLY KAPCSOLÓTÁBLA
-- ──────────────────────────────────────────────
CREATE TABLE beosztas_szemely (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    beosztas_id         INT NOT NULL,
    szemely_id          INT NOT NULL,
    szerep              VARCHAR(80) DEFAULT 'résztvevő',
    jelenleti_allapot   ENUM('tervezett','megjelent','hiányzott','beteg') DEFAULT 'tervezett',
    UNIQUE KEY uq_beosztas_szemely (beosztas_id, szemely_id),
    FOREIGN KEY (beosztas_id) REFERENCES beosztas(id) ON DELETE CASCADE,
    FOREIGN KEY (szemely_id)  REFERENCES szemely(id)  ON DELETE CASCADE
);

-- ──────────────────────────────────────────────
--  5. ESZKÖZÖK / FELSZERELÉS
-- ──────────────────────────────────────────────
CREATE TABLE eszkoz (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    nev                 VARCHAR(150) NOT NULL,
    kategoria           VARCHAR(80),
    sorozatszam         VARCHAR(100) UNIQUE,
    allapot             ENUM('jó','javítandó','selejtezendő') NOT NULL DEFAULT 'jó',
    qr_kod              VARCHAR(100) UNIQUE,
    leiras              TEXT,
    letrehozva          DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ──────────────────────────────────────────────
--  6. ESZKÖZKIADÁS / VISSZAVÉTEL NAPLÓ
-- ──────────────────────────────────────────────
CREATE TABLE eszkoz_kiadasa (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    eszkoz_id           INT NOT NULL,
    szemely_id          INT NOT NULL,
    kiadva              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    visszaveve          DATETIME,
    kiadta_felh_id      INT,
    megjegyzes          TEXT,
    FOREIGN KEY (eszkoz_id)       REFERENCES eszkoz(id)      ON DELETE RESTRICT,
    FOREIGN KEY (szemely_id)      REFERENCES szemely(id)     ON DELETE RESTRICT,
    FOREIGN KEY (kiadta_felh_id)  REFERENCES felhasznalo(id) ON DELETE SET NULL
);

-- ──────────────────────────────────────────────
--  HASZNOS NÉZETEK
-- ──────────────────────────────────────────────

-- Ki milyen eszközt tart éppen magánál
CREATE VIEW eszkoz_jelenlegi_kiadasa AS
    SELECT e.nev AS eszkoz, e.allapot, sz.nev AS szemely, ek.kiadva
    FROM eszkoz_kiadasa ek
    JOIN eszkoz  e  ON e.id  = ek.eszkoz_id
    JOIN szemely sz ON sz.id = ek.szemely_id
    WHERE ek.visszaveve IS NULL;

-- Közelgő és aktív beosztások
CREATE VIEW aktiv_beosztasok AS
    SELECT b.nev, b.tipus, b.kezdete, b.vege, b.helyszin,
           COUNT(bs.szemely_id) AS letszam
    FROM beosztas b
    LEFT JOIN beosztas_szemely bs ON bs.beosztas_id = b.id
    WHERE b.vege >= CURDATE()
    GROUP BY b.id;

-- Alapadatok teszteléshez
INSERT INTO szemely (nev, rendfokozat, alakulat, statusz) VALUES
    ('Kovács János',  'szakaszvezető', '1. zászlóalj', 'aktív'),
    ('Nagy Péter',    'tizedes',       '1. zászlóalj', 'tartalékos'),
    ('Szabó Anna',    'hadnagy',       'törzs',         'aktív');

INSERT INTO felhasznalo (szemely_id, felhasznalonev, jelszo_hash, szerepkor) VALUES
    (3, 'szabo.anna', '$2b$12$placeholder_hash_here', 'parancsnok'),
    (1, 'kovacs.janos', '$2b$12$placeholder_hash_here', 'felhasznalo');
