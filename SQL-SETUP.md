# Setup SQL Barber App

1. Crea un progetto su Supabase.
2. Apri SQL Editor e incolla il contenuto di `supabase/schema.sql`.
3. In Settings > API copia:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Inserisci le variabili in `.env.local` e su Vercel.
5. Esegui un nuovo deploy.

## Note importanti
- Le prenotazioni annullate vengono salvate con `status = cancelled`.
- Gli slot pubblici leggono solo le prenotazioni attive, quindi uno slot torna disponibile subito dopo la disdetta.
- Se l'evento su Google Calendar è già stato eliminato, il gestionale non va più in errore: il database viene comunque aggiornato correttamente.
