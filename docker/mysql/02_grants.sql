-- Corrida como root por el entrypoint de la imagen mysql en el PRIMER arranque
-- del volumen (docker-entrypoint-initdb.d, orden alfabético: después del seed).
--
-- La imagen crea el usuario de MYSQL_USER con permisos SOLO sobre
-- MYSQL_DATABASE; acá le damos acceso total a los 5 schemas que carga el dump
-- (platform_accounts, inventory, mercadolibre, tiendanube, ai).
--
-- Mantener el nombre de usuario en sync con USER_DB de backend/.env.
GRANT ALL PRIVILEGES ON *.* TO 'nicolas'@'%' WITH GRANT OPTION;
FLUSH PRIVILEGES;
