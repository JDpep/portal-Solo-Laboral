-- ============================================================================
-- CAMBIAR LA CONTRASEÑA CIERRA LAS DEMÁS SESIONES
--
-- Las cuentas se entregan con una contraseña TEMPORAL que alguien tiene que
-- hacer llegar a su dueño —un mensaje, una llamada, un papel—, y esa persona la
-- cambia por la suya en cuanto entra. Todo ese trayecto es la parte frágil: la
-- contraseña temporal pasa por sitios que nadie controla.
--
-- Sin esta columna, cambiarla no revocaba nada. La sesión es una cookie firmada
-- que lleva el id y la hora de emisión, y el servidor solo comprobaba que la
-- cuenta siguiera activa: quien hubiera entrado con la temporal seguía dentro
-- hasta doce horas después, aunque el dueño ya la hubiera cambiado. Es decir,
-- el gesto que se hace precisamente para cortar el acceso no lo cortaba.
--
-- Con `password_changed_at`, toda sesión emitida ANTES del cambio deja de
-- valer. La sesión de quien cambia su propia contraseña se vuelve a emitir en
-- el mismo momento, así que él no se cae; se caen los demás, que es el objetivo.
--
-- Nula en las cuentas que ya existen: sin fecha de cambio no hay nada anterior
-- que invalidar, y sus sesiones vivas siguen valiendo. La columna empieza a
-- contar a partir del primer cambio de cada quien.
-- ============================================================================

ALTER TABLE staff_users
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

COMMENT ON COLUMN staff_users.password_changed_at IS
  'Último cambio de contraseña. Invalida las sesiones emitidas antes.';
