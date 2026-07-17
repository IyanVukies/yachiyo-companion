# Proactive Interaction Plan

## Tujuan

Membuat Yachiyo dapat memulai interaksi, tetapi tidak menjadi spam atau mengganggu.

## Trigger v1

- Morning greeting.
- Evening review.
- Custom reminder.
- Upcoming local event.
- Deadline reminder.
- Inactivity check-in.
- Manual test notification.

Integrasi kalender, email, dan Telegram push tidak boleh dipalsukan. Tampilkan sebagai “belum terhubung” sampai benar-benar tersedia.

## Policy engine

Setiap trigger harus melewati policy:

1. Apakah fitur aktif?
2. Apakah sedang quiet hours?
3. Apakah daily limit tercapai?
4. Apakah minimum gap terpenuhi?
5. Apakah isi duplikat?
6. Apakah user sedang fullscreen/presenting?
7. Apakah reminder sudah snoozed/dismissed?
8. Apakah informasi cukup penting?
9. Apakah avatar sedang berbicara atau user sedang aktif?

Jika tidak lolos, event disimpan atau dibuang sesuai tipe.

## Defaults

- Timezone: `Asia/Jakarta`.
- Quiet hours: 23:00–07:00.
- Daily proactive limit: 5.
- Minimum gap: 90 menit.
- Duplicate suppression: aktif.
- Inactivity check-in: nonaktif secara default sampai pengguna menyetujui.

## Reminder UX

Notification harus memiliki:

- Judul pendek.
- Isi maksimal beberapa kalimat.
- Open chat.
- Snooze 10 menit.
- Snooze 1 jam.
- Dismiss.
- Disable trigger type.

## Hermes-assisted proactive content

Untuk event yang memerlukan wording, aplikasi dapat meminta Hermes membuat teks pendek.

Prompt harus:

- Memberikan fakta event.
- Meminta maksimal dua kalimat.
- Melarang fabrikasi.
- Mengizinkan output `[SILENT]` ketika tidak bernilai.

Namun policy lokal tetap menjadi keputusan akhir.

## Future push bridge

Siapkan interface:

```text
ProactiveEventSource
├── LocalSchedulerSource
├── HermesPushSource
├── CalendarSource
└── EmailSource
```

Hanya LocalSchedulerSource wajib aktif di v1.

## Safety and privacy

- Jangan membaca aktivitas keyboard secara luas.
- Jangan merekam layar.
- Deteksi fullscreen cukup melalui API OS yang sesuai.
- Jangan menyimpulkan emosi pengguna dari aktivitas.
- Semua proactive category dapat dimatikan.

## Acceptance criteria

- Manual test notification bekerja.
- Quiet hours menahan event.
- Daily limit bekerja.
- Duplicate suppression bekerja.
- Snooze persist setelah restart.
- Dismiss tidak memunculkan event sama.
- Aplikasi tidak mengirim reminder palsu.
