# Pianificare un evento: notizie e promemoria

Questo documento spiega cosa succede quando premi **📅 Pianifica Evento** nel canale *gestione-eventi*. Il pulsante è **riservato a chi ha i permessi di amministrazione**. Per preparare eventi e template vedi [Gestire eventi e template](#).

## Come si pianifica

1. Premi **📅 Pianifica Evento**.
2. Scegli il **Template Evento** dalla lista.
3. Inserisci **Data e Ora** nel formato `GG/MM/AAAA HH:MM`, in **ora italiana** (es. `20/11/2026 21:30`).
4. Invia il modulo.

Se non esiste ancora nessun template, il bot ti chiede di crearne uno con **📝 Crea Template Evento**.

## Cosa fa il bot

### Subito

Crea l'**evento programmato su Discord** nel canale vocale degli eventi, con titolo, descrizione e immagine del template. In cima alla descrizione aggiunge una riga di riepilogo, ad esempio:

> **🎨 Arte | 👥 Max 12 persone | ✅ Partecipazione libera**

Il bot risponde con il link all'evento creato.

### Una settimana prima, alle 12:00

Pubblica la **notizia** nel canale notizie del template:

- il messaggio del template, con le variabili `{{data}}`, `{{ora}}` e `{{partecipanti}}` già sostituite;
- in coda, il **tag del ruolo di interesse** e il **link all'evento Discord**;
- un **thread dei commenti** sotto la notizia (es. *💬 Arte libera | sabato 28 novembre*), aperto con il messaggio per il thread del template o, se assente, con un invito generico a commentare.

> **Se mancano meno di 7 giorni** all'evento quando lo pianifichi, la notizia viene pubblicata **subito**.

### Il giorno stesso, alle 12:00

Pubblica nel thread della notizia un **promemoria** che **pinga tutti quelli che hanno cliccato "Mi interessa"** sull'evento Discord.

> Se pianifichi un evento per oggi quando le 12:00 sono già passate, il promemoria non verrà pubblicato.

## Eventi chiusi (con iscrizione)

Se l'evento è impostato come **non aperto** (*Evento aperto: No*), il thread della notizia serve anche a **raccogliere le iscrizioni**:

- in coda alla notizia compare il link **"VUOI ISCRIVERTI ALL'EVENTO? CLICCA QUI!"**, che porta al messaggio di apertura del thread;
- lo stesso link viene aggiunto anche alla descrizione dell'evento Discord.

## Annullare un evento

Per annullare un evento pianificato, **elimina l'evento programmato direttamente da Discord**. Se l'evento Discord non esiste più, il bot salta la notizia e il promemoria.

## Cose da sapere

- Notizie e promemoria partono **solo allo scoccare delle 12:00**: se in quel momento il bot è offline, quelli del giorno non vengono recuperati.
- Il thread dei commenti si archivia dopo una settimana di inattività; il giorno dell'evento il bot lo riapre in automatico per il promemoria.
- Le modifiche a template ed eventi non aggiornano notizie ed eventi Discord già pubblicati.

## Messaggi di errore frequenti

| Messaggio | Cosa fare |
|---|---|
| *non è una data valida nel formato GG/MM/AAAA HH:MM* | Controlla il formato e che la data esista (es. niente 31/02). |
| *il ruolo di interesse … non esiste più* | Il ruolo dell'evento è stato eliminato: aggiorna l'evento con **✏️ Modifica Evento**. |
| *Non è stato possibile creare l'evento su Discord* | Nulla viene salvato: correggi la causa indicata e riprova. |
| *non è stato possibile pubblicare subito la notizia della settimana prima* | L'evento è comunque pianificato; avvisa un amministratore tecnico. |
