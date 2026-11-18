# Gestire eventi e template

Questo documento descrive i pulsanti del canale *gestione-eventi* che servono a preparare ciò che poi verrà pianificato. **I pulsanti sono riservati a chi ha i permessi di amministrazione**: per gli altri il bot risponde con un messaggio di errore.

## I concetti

| Concetto | Cos'è | Esempio |
|---|---|---|
| **Evento** | Il *tipo* di serata: sezione, ruolo di interesse, numero di partecipanti, modalità di accesso. | "Arte libera" |
| **Template** | Il "modello" di un evento: titolo, descrizione e immagine dell'evento Discord, più il testo della notizia. Un evento può avere più template. | "Arte libera – tema autunno" |
| **Edizione** | Una singola data in cui un template viene pianificato. Si crea con **📅 Pianifica Evento**. | "Arte libera – tema autunno, 21/11 alle 21:15" |

L'ordine per partire da zero è quindi: **Crea Evento** → **Crea Template Evento** → **Pianifica Evento**.

---

## 🎉 Crea Evento

Registra un nuovo tipo di evento. Campi del modulo:

| Campo | Descrizione |
|---|---|
| **Nome** | Nome dell'evento, max 100 caratteri. |
| **Sezione** | Sezione della community a cui appartiene l'evento. |
| **Interesse** | ID del ruolo Discord di riferimento (es. `1321813930842001468`). Il ruolo viene taggato nella notizia e mostrato nell'evento Discord. Per copiarlo: *Impostazioni server > Ruoli*, tasto destro sul ruolo > *Copia ID ruolo* (serve la Modalità sviluppatore attiva). |
| **Numero di partecipanti** | Numero massimo di persone; `0` per nessun limite. |
| **Evento aperto** | **Sì** = partecipazione libera; **No** = serve l'iscrizione (vedi la sezione "Eventi chiusi" in [Pianificare un evento: notizie e promemoria](#)). |

## 📝 Crea Template Evento

Il modulo è diviso in **due passi**, perché Discord permette al massimo cinque campi per modulo.

### Passo 1 – Evento Discord

| Campo | Descrizione | Limite |
|---|---|---|
| **Evento** | L'evento a cui appartiene il template. | — |
| **Nome Template** | Il nome con cui il template compare nella lista di **Pianifica Evento**. | 100 caratteri |
| **Titolo dell'Evento Discord** | Titolo dell'evento programmato su Discord e del thread dei commenti. | 100 caratteri |
| **Descrizione dell'Evento Discord** | Markdown. La riga di riepilogo (ruolo, partecipanti, accesso) viene aggiunta in automatico in cima. | 800 caratteri |
| **Immagine dell'Evento Discord** | Copertina dell'evento. PNG, JPEG, GIF o WEBP. | 4 MB |

Inviato il primo passo, il bot risponde con il pulsante **Continua: notizia e thread**. **Premilo entro 15 minuti**, altrimenti la bozza viene scartata e bisogna ricominciare.

### Passo 2 – Notizia e thread

| Campo | Descrizione | Limite |
|---|---|---|
| **Canale Notizie Discord** | ID del canale in cui pubblicare la notizia (es. `1547270860338106460`). | — |
| **Messaggio per Canale Notizie Discord** | Markdown. È la notizia pubblicata una settimana prima dell'evento. | 1800 caratteri |
| **Messaggio per Thread nel Canale Notizie** | Facoltativo. Primo messaggio del thread dei commenti; se vuoto, il bot scrive un invito generico a commentare. | 2000 caratteri |

### Variabili

Nei due messaggi del passo 2 puoi usare queste variabili, sostituite al momento della pubblicazione:

| Variabile | Valore | Esempio |
|---|---|---|
| `{{data}}` | Giorno dell'evento | *sabato 21 novembre* |
| `{{ora}}` | Ora italiana dell'evento | *21:15* |
| `{{partecipanti}}` | Numero massimo di partecipanti (`0` se non c'è limite) | *12* |

Non serve aggiungere a mano il tag del ruolo né il link all'evento: il bot li mette in coda alla notizia.

---

## ✏️ Modifica Evento / Modifica Template Evento

1. Premi il pulsante e scegli l'evento o il template dalla lista.
2. Il bot risponde con un pulsante **Modifica**: premilo per aprire il modulo già compilato con i valori attuali.
3. Cambia solo ciò che ti serve e invia.

Nel template l'**immagine è facoltativa**: caricala solo se vuoi sostituire quella attuale. Anche la modifica del template è in due passi, con lo stesso limite di 15 minuti.

> Le modifiche valgono per le pubblicazioni future: notizie ed eventi Discord già pubblicati non vengono aggiornati.

## 🗑️ Cancella Evento / Cancella Template Evento

Scegli dalla lista l'evento o il template da cancellare. Ci sono due vincoli:

- **Un evento con dei template non può essere cancellato**: cancella prima i suoi template.
- **Un template già pianificato almeno una volta non può essere cancellato**, finché esistono le sue edizioni.

---

## Limiti noti

- Le liste di scelta mostrano **al massimo 25 elementi** (limite di Discord).
- Ruolo di interesse e canale notizie si inseriscono come **ID numerico**: in futuro diventeranno menu a tendina.

## Messaggi di errore frequenti

| Messaggio | Cosa fare |
|---|---|
| *Non hai i permessi necessari* | Servono i permessi di amministrazione. |
| *nessun ruolo trovato con ID …* | Controlla l'ID del ruolo di interesse. |
| *deve essere un numero intero maggiore o uguale a 0* | Il numero di partecipanti deve essere un numero, `0` per nessun limite. |
| *L'immagine … deve essere un file PNG, JPEG, GIF o WEBP* / *non può superare i 4 MB* | Cambia o comprimi l'immagine. |
| Bozza scaduta dopo il passo 1 | Sono passati più di 15 minuti: ricomincia dal passo 1. |
| *… ha ancora dei template* | Cancella prima i template dell'evento. |
| *… è già stato pianificato almeno una volta* | Il template non può essere cancellato. |
