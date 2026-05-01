# Gestionale multisalone - 1 operatore

Versione basata sull'ultimo ZIP funzionante.

## Cosa è stato mantenuto
- 1 solo operatore
- nessuna selezione collaboratore nella web app
- prenotazioni di gruppo separate nello storico/dashboard
- fino a 5 persone in una prenotazione
- durata occupata corretta: durata servizio x numero persone

## Come scegliere il salone
Nel progetto Vercel imposta queste variabili:

```env
NEXT_PUBLIC_SALON_ID=salone_1
SALON_ID=salone_1
```

Per un secondo salone puoi duplicare il progetto Vercel e cambiare:

```env
NEXT_PUBLIC_SALON_ID=salone_2
SALON_ID=salone_2
```

Ogni salone userà gli stessi tavoli Supabase ma leggerà/scriverà solo i dati del proprio `salon_id`.

## SQL
Esegui su Supabase:

```text
SQL_MULTISALONE_1_OPERATORE.sql
```

Lo script non cancella dati esistenti e prepara tabelle, indici, `salon_id`, operatore unico, servizi, storico, bookings, ricorrenze e cache slot.
