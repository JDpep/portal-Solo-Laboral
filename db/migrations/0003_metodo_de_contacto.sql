-- ============================================================================
-- CÓMO PREFIERE QUE LO CONTACTEN.
--
-- Tras calificar, la persona elige entre WhatsApp, agendar una llamada o pedir
-- que le llamen enseguida. Se guarda su elección y las señales que produce.
--
-- NO se crea una tabla `lead_contact_events`: los eventos con hora ya viven en
-- `calendar_events` —que es lo que el abogado abre en su agenda— y el rastro de
-- lo que hizo el prospecto ya vive en `audit_logs`. Una tercera tabla con la
-- misma información habría creado dos versiones de la misma verdad.
-- ============================================================================

CREATE TYPE contact_method AS ENUM ('whatsapp', 'scheduled_call', 'quick_call');

ALTER TABLE leads
  -- Lo que la persona ELIGIÓ. No dice que se le haya contactado.
  ADD COLUMN preferred_contact_method contact_method,

  -- Abrió WhatsApp con el mensaje preparado. NO significa que lo enviara: con
  -- un enlace wa.me el sistema no puede saberlo, y guardar "mensaje enviado"
  -- porque alguien tocó un botón sería inventarse un hecho. El día que exista
  -- WhatsApp Business API y llegue confirmación real, ESO se guardará aparte.
  ADD COLUMN whatsapp_opened_at timestamptz,

  -- Momento previsto de la llamada próxima ("que me llamen en 10-15 minutos").
  -- Es una previsión del sistema, no un compromiso del despacho.
  ADD COLUMN scheduled_call_at timestamptz,

  -- Contacto REAL, no intención. Solo se sella cuando hay señal de que alguien
  -- del despacho habló con la persona — hoy a mano, mañana quizá desde una
  -- integración. Abrir WhatsApp jamás lo llena.
  ADD COLUMN contacted_at timestamptz;

-- Analítica: cuántos calificados eligieron cada vía.
CREATE INDEX leads_por_metodo_preferido ON leads (preferred_contact_method)
  WHERE preferred_contact_method IS NOT NULL;

-- Solo un lead visible puede haber elegido cómo lo contactan: a quien no pasó
-- el filtro nunca se le ofrecen las opciones, y la base lo sostiene aunque
-- alguien llame al repositorio por otra puerta.
ALTER TABLE leads ADD CONSTRAINT contacto_solo_si_visible CHECK (
  (qualification_status = 'qualified' OR source <> 'web_form')
  OR (preferred_contact_method IS NULL AND whatsapp_opened_at IS NULL
      AND scheduled_call_at IS NULL)
);
