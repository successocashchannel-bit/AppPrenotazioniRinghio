# Setup SQL Barber App - Versione DB Only

1. Crea un progetto su Supabase.
2. Apri SQL Editor e incolla il contenuto di `supabase/schema.sql`.
3. In Settings > API copia:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Inserisci le variabili in `.env.local` e su Vercel.
5. Esegui un nuovo deploy.

## Questa versione usa solo il database
- Nessuna dipendenza da Google Calendar
- Nessun OAuth richiesto
- Web app e gestionale leggono e scrivono direttamente su Supabase

## Note
- Le prenotazioni annullate vengono salvate con `status = cancelled`.
- Gli slot pubblici leggono solo le prenotazioni attive, quindi uno slot torna disponibile subito dopo la disdetta.
- Il campo `google_event_id` può restare presente nello schema ma non viene utilizzato.


## Ricorrenze
Se hai già creato la tabella `bookings`, aggiungi anche i campi `recurring_series_id` e `recurrence_label` eseguendo il file aggiornato `supabase/schema.sql`.


## Rimozione definitiva dei servizi con storico
Se vuoi eliminare davvero un servizio anche quando compare nello storico prenotazioni, esegui anche:

- `supabase/fix-delete-services-set-null.sql`

Questo mantiene lo storico leggibile e mette `service_id = NULL` nei booking storici quando il servizio viene eliminato.


## Logo nelle impostazioni
Esegui anche:
- `supabase/add-logo-url-to-business-settings.sql`

Questo aggiunge il campo `logo_url` alla tabella `business_settings`, così il logo si salva davvero nel database.
