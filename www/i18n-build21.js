/* BagPing Build 21 locale patch. Loads AFTER i18n.js, i18n-claim.js, i18n-radar.js.
   Contains:
   1. The MISSING "en" block for Belt Radar + structured claim flow
      (i18n-radar.js ships 18 locales, not 19 - English radar keys never existed,
      which is why English lookups fell through / stale strings stuck around).
   2. "AI Crew" rename (nav_crew + crew_title) for all 19 locales.
   3. Full crew-card names + descriptions for all 19 locales, so no crew label
      can ever fall back to English regardless of gaps in i18n.js. */
(function(){
  if (typeof BAGPING_I18N === 'undefined') return;
  var ADD = {
    "en": {
      "nav_crew": "AI Crew",
      "crew_title": "AI Crew",
      "crew_subtitle": "Your team on the ground. Ask anything.",
      "crew_bag": "Bag Tracker", "crew_bag_desc": "Real-time bag status and alerts",
      "crew_flight": "Flight Desk", "crew_flight_desc": "Gate changes, delays",
      "crew_companion": "Travel Guide", "crew_companion_desc": "Maps, food, transport",
      "crew_claim": "Claim Helper", "crew_claim_desc": "Draft your claim now",
      "crew_insurance": "Policy Reader", "crew_insurance_desc": "Decode your travel policy",
      "radar_title": "Belt Radar",
      "radar_sub": "Alerts you as your bag gets close.",
      "radar_aria": "Belt Radar - alerts you as your bag gets close",
      "radar_panel_sub": "Get an alert the moment your bag reaches the belt.",
      "radar_setup": "Tap to set up",
      "radar_ready": "Ready",
      "radar_watching": "Watching...",
      "radar_approaching": "Approaching",
      "radar_close": "Close by",
      "radar_here": "It's here",
      "radar_here_grab": "It's here - grab it!",
      "radar_not_tracking": "Not tracking",
      "radar_activate_title": "Activate your device",
      "radar_serial_ph": "Serial number on your BagPing tag",
      "radar_activate_btn": "Activate",
      "radar_activated": "Activated",
      "radar_activated_toast": "BagPing activated. Safe travels!",
      "radar_activated_fallback": "Activated. (The tag will be recognized at the belt.)",
      "radar_activate_first": "Activate your BagPing device first.",
      "radar_enter_serial": "Enter your BagPing device's serial number.",
      "radar_activating": "Activating",
      "radar_photo_title": "Your bag photo",
      "radar_photo_sub": "Shown in the alert so you recognize your bag. Stays on your phone.",
      "radar_photo_add": "Add bag photo",
      "radar_photo_retake": "Retake photo",
      "radar_photo_saved": "Bag photo saved on your device.",
      "radar_camera_native": "The camera is available in the installed app.",
      "radar_proximity": "Proximity",
      "radar_start": "Start Belt Radar",
      "radar_stop": "Stop Belt Radar",
      "radar_demo": "Run demo (no tag needed)",
      "radar_demo_running": "Demo: your bag is approaching the belt...",
      "radar_demo_done": "Demo finished - that's exactly how the real ping feels.",
      "radar_watching_status": "Belt Radar active. Watching for your bag...",
      "radar_start_failed": "Belt Radar could not start. Check Bluetooth + Location.",
      "radar_native_only": "Belt Radar runs in the installed app. Try the demo below.",
      "radar_ping_here": "Your bag is on the belt. Grab it!",
      "radar_ping_approaching": "Your bag is arriving at the carousel.",
      "radar_close_btn": "Close",
      "belt_scene_label": "Bags moving on the arrivals belt; your tagged bag is sending a signal",
      "claim_hero_title": "Bag missing?",
      "claim_hero_sub": "Build an insurer-ready claim file in minutes - before you even leave the airport.",
      "claim_hero_cta": "Start my claim",
      "claim_title": "Build your claim",
      "claim_sub": "Photograph or attach each document. PIR first - it gates every claim.",
      "claim_sec_pir": "PIR - Property Irregularity Report",
      "claim_sec_pir_sub": "Required. The airline issues it at the baggage desk. No PIR, no claim.",
      "claim_sec_boarding": "Boarding pass / bag tag",
      "claim_sec_boarding_sub": "Proves the bag traveled with you.",
      "claim_sec_receipts": "Receipts",
      "claim_sec_receipts_sub": "Bag contents and emergency purchases.",
      "claim_sec_corr": "Airline correspondence",
      "claim_sec_corr_sub": "Emails, texts, reference numbers.",
      "claim_required": "Required",
      "claim_captured": "Captured",
      "claim_photograph": "Photograph",
      "claim_attach": "Attach file",
      "claim_remove": "Remove",
      "claim_note_title": "Anything else?",
      "claim_note_ph": "e.g. bag last seen at the Frankfurt connection, contains medication...",
      "claim_attach_count": "attachments",
      "claim_build_cta": "Build claim file",
      "claim_building": "Building your claim file...",
      "claim_max": "Maximum of 12 attachments reached.",
      "claim_too_big": "File too large (max 6 MB). Photograph it instead.",
      "claim_no_auth": "Not signed in - restart the app and try again.",
      "claim_failed": "The claim file could not be built.",
      "claim_stop_title": "Stop - file your PIR first",
      "claim_stop_head": "No PIR found.",
      "claim_stop_body": "Without a Property Irregularity Report (PIR) filed with the airline, no baggage claim can be submitted to any insurer. File it at the baggage desk before you leave the airport - then come back.",
      "claim_stop_back": "I have my PIR - continue",
      "claim_result_title": "Your claim file",
      "claim_result_sub": "Checked against what airlines and insurers actually require.",
      "claim_completeness": "Completeness",
      "claim_missing": "Still missing:",
      "claim_complete": "Complete - nothing missing.",
      "claim_denial_risk": "Denial risk",
      "claim_risk_low": "Low",
      "claim_risk_medium": "Medium",
      "claim_risk_high": "High",
      "claim_valuation": "Valuation",
      "claim_val_total": "Estimated value",
      "claim_val_cap": "Montreal Convention cap",
      "claim_val_gap": "Uncovered gap",
      "claim_share": "Export claim file",
      "claim_add_more": "Add more documents",
      "claim_copied": "Claim file copied to clipboard.",
      "claim_copy_failed": "Couldn't copy - press and hold to select the text.",
      "claim_close": "Close"
    },
    "es": {
      "nav_crew": "Equipo IA", "crew_title": "Equipo IA",
      "crew_subtitle": "Tu equipo en tierra. Pregunta lo que quieras.",
      "crew_bag": "Rastreador de maletas", "crew_bag_desc": "Estado y alertas de tu maleta en tiempo real",
      "crew_flight": "Mesa de vuelos", "crew_flight_desc": "Cambios de puerta, retrasos",
      "crew_companion": "Guía de viaje", "crew_companion_desc": "Mapas, comida, transporte",
      "crew_claim": "Asistente de reclamos", "crew_claim_desc": "Redacta tu reclamo ahora",
      "crew_insurance": "Lector de pólizas", "crew_insurance_desc": "Descifra tu póliza de viaje"
    },
    "fr": {
      "nav_crew": "Équipe IA", "crew_title": "Équipe IA",
      "crew_subtitle": "Votre équipe au sol. Demandez ce que vous voulez.",
      "crew_bag": "Suivi bagage", "crew_bag_desc": "Statut et alertes de votre valise en temps réel",
      "crew_flight": "Bureau des vols", "crew_flight_desc": "Changements de porte, retards",
      "crew_companion": "Guide de voyage", "crew_companion_desc": "Cartes, restaurants, transports",
      "crew_claim": "Assistant réclamation", "crew_claim_desc": "Rédigez votre réclamation maintenant",
      "crew_insurance": "Lecteur de police", "crew_insurance_desc": "Décodez votre assurance voyage"
    },
    "de": {
      "nav_crew": "KI-Crew", "crew_title": "KI-Crew",
      "crew_subtitle": "Ihr Team am Boden. Fragen Sie alles.",
      "crew_bag": "Koffer-Tracker", "crew_bag_desc": "Kofferstatus und Alarme in Echtzeit",
      "crew_flight": "Flug-Desk", "crew_flight_desc": "Gate-Änderungen, Verspätungen",
      "crew_companion": "Reiseführer", "crew_companion_desc": "Karten, Essen, Verkehr",
      "crew_claim": "Reklamationshelfer", "crew_claim_desc": "Erstellen Sie jetzt Ihre Reklamation",
      "crew_insurance": "Policen-Leser", "crew_insurance_desc": "Verstehen Sie Ihre Reisepolice"
    },
    "it": {
      "nav_crew": "Squadra IA", "crew_title": "Squadra IA",
      "crew_subtitle": "La tua squadra a terra. Chiedi qualsiasi cosa.",
      "crew_bag": "Tracker valigia", "crew_bag_desc": "Stato e avvisi della valigia in tempo reale",
      "crew_flight": "Banco voli", "crew_flight_desc": "Cambi gate, ritardi",
      "crew_companion": "Guida di viaggio", "crew_companion_desc": "Mappe, cibo, trasporti",
      "crew_claim": "Assistente reclami", "crew_claim_desc": "Prepara subito il tuo reclamo",
      "crew_insurance": "Lettore di polizza", "crew_insurance_desc": "Decifra la tua polizza di viaggio"
    },
    "pt": {
      "nav_crew": "Equipa IA", "crew_title": "Equipa IA",
      "crew_subtitle": "A sua equipa em terra. Pergunte o que quiser.",
      "crew_bag": "Localizador de malas", "crew_bag_desc": "Estado e alertas da sua mala em tempo real",
      "crew_flight": "Balcão de voos", "crew_flight_desc": "Mudanças de porta, atrasos",
      "crew_companion": "Guia de viagem", "crew_companion_desc": "Mapas, comida, transportes",
      "crew_claim": "Assistente de reclamação", "crew_claim_desc": "Prepare já a sua reclamação",
      "crew_insurance": "Leitor de apólice", "crew_insurance_desc": "Decifre a sua apólice de viagem"
    },
    "ar": {
      "nav_crew": "طاقم AI", "crew_title": "طاقم AI",
      "crew_subtitle": "فريقك على الأرض. اسأل عن أي شيء.",
      "crew_bag": "متتبع الحقائب", "crew_bag_desc": "حالة حقيبتك وتنبيهاتها لحظة بلحظة",
      "crew_flight": "مكتب الرحلات", "crew_flight_desc": "تغييرات البوابات والتأخيرات",
      "crew_companion": "دليل السفر", "crew_companion_desc": "خرائط وطعام ومواصلات",
      "crew_claim": "مساعد المطالبات", "crew_claim_desc": "أعدّ مطالبتك الآن",
      "crew_insurance": "قارئ الوثيقة", "crew_insurance_desc": "افهم وثيقة تأمين سفرك"
    },
    "zh": {
      "nav_crew": "AI 团队", "crew_title": "AI 团队",
      "crew_subtitle": "你的地面团队，随时提问。",
      "crew_bag": "行李追踪", "crew_bag_desc": "实时行李状态与提醒",
      "crew_flight": "航班服务台", "crew_flight_desc": "登机口变更、延误",
      "crew_companion": "旅行向导", "crew_companion_desc": "地图、美食、交通",
      "crew_claim": "理赔助手", "crew_claim_desc": "立即起草你的理赔",
      "crew_insurance": "保单解读", "crew_insurance_desc": "看懂你的旅行保险"
    },
    "ja": {
      "nav_crew": "AIクルー", "crew_title": "AIクルー",
      "crew_subtitle": "地上のあなたのチーム。何でも聞いてください。",
      "crew_bag": "バッグトラッカー", "crew_bag_desc": "荷物の状態と通知をリアルタイムで",
      "crew_flight": "フライトデスク", "crew_flight_desc": "ゲート変更、遅延",
      "crew_companion": "トラベルガイド", "crew_companion_desc": "地図、グルメ、交通",
      "crew_claim": "請求ヘルパー", "crew_claim_desc": "今すぐ請求書類を作成",
      "crew_insurance": "保険リーダー", "crew_insurance_desc": "旅行保険をわかりやすく"
    },
    "ko": {
      "nav_crew": "AI 크루", "crew_title": "AI 크루",
      "crew_subtitle": "지상의 당신 팀. 무엇이든 물어보세요.",
      "crew_bag": "가방 트래커", "crew_bag_desc": "실시간 가방 상태와 알림",
      "crew_flight": "항공편 데스크", "crew_flight_desc": "게이트 변경, 지연",
      "crew_companion": "여행 가이드", "crew_companion_desc": "지도, 음식, 교통",
      "crew_claim": "클레임 도우미", "crew_claim_desc": "지금 바로 클레임 작성",
      "crew_insurance": "보험 리더", "crew_insurance_desc": "여행 보험을 쉽게 해석"
    },
    "ru": {
      "nav_crew": "ИИ-команда", "crew_title": "ИИ-команда",
      "crew_subtitle": "Ваша команда на земле. Спрашивайте о чём угодно.",
      "crew_bag": "Трекер багажа", "crew_bag_desc": "Статус чемодана и уведомления в реальном времени",
      "crew_flight": "Стойка рейсов", "crew_flight_desc": "Смена выхода, задержки",
      "crew_companion": "Гид по путешествию", "crew_companion_desc": "Карты, еда, транспорт",
      "crew_claim": "Помощник по претензиям", "crew_claim_desc": "Составьте претензию прямо сейчас",
      "crew_insurance": "Чтец полиса", "crew_insurance_desc": "Разберитесь в своей страховке"
    },
    "nl": {
      "nav_crew": "AI-crew", "crew_title": "AI-crew",
      "crew_subtitle": "Jouw team op de grond. Vraag wat je wilt.",
      "crew_bag": "Koffertracker", "crew_bag_desc": "Kofferstatus en meldingen in realtime",
      "crew_flight": "Vluchtdesk", "crew_flight_desc": "Gatewijzigingen, vertragingen",
      "crew_companion": "Reisgids", "crew_companion_desc": "Kaarten, eten, vervoer",
      "crew_claim": "Claimhulp", "crew_claim_desc": "Stel nu je claim op",
      "crew_insurance": "Polislezer", "crew_insurance_desc": "Ontcijfer je reispolis"
    },
    "pl": {
      "nav_crew": "Załoga AI", "crew_title": "Załoga AI",
      "crew_subtitle": "Twój zespół na ziemi. Pytaj o wszystko.",
      "crew_bag": "Lokalizator bagażu", "crew_bag_desc": "Status walizki i alerty w czasie rzeczywistym",
      "crew_flight": "Biuro lotów", "crew_flight_desc": "Zmiany bramek, opóźnienia",
      "crew_companion": "Przewodnik podróży", "crew_companion_desc": "Mapy, jedzenie, transport",
      "crew_claim": "Asystent reklamacji", "crew_claim_desc": "Przygotuj reklamację już teraz",
      "crew_insurance": "Czytnik polisy", "crew_insurance_desc": "Rozszyfruj swoją polisę podróżną"
    },
    "tr": {
      "nav_crew": "AI Ekibi", "crew_title": "AI Ekibi",
      "crew_subtitle": "Yerdeki ekibiniz. Her şeyi sorun.",
      "crew_bag": "Valiz Takibi", "crew_bag_desc": "Gerçek zamanlı valiz durumu ve uyarılar",
      "crew_flight": "Uçuş Masası", "crew_flight_desc": "Kapı değişiklikleri, rötarlar",
      "crew_companion": "Seyahat Rehberi", "crew_companion_desc": "Haritalar, yemek, ulaşım",
      "crew_claim": "Talep Yardımcısı", "crew_claim_desc": "Talebini şimdi hazırla",
      "crew_insurance": "Poliçe Okuyucu", "crew_insurance_desc": "Seyahat poliçeni çözümle"
    },
    "sv": {
      "nav_crew": "AI-crew", "crew_title": "AI-crew",
      "crew_subtitle": "Ditt team på marken. Fråga vad som helst.",
      "crew_bag": "Väsktracker", "crew_bag_desc": "Väskstatus och larm i realtid",
      "crew_flight": "Flygdesk", "crew_flight_desc": "Gateändringar, förseningar",
      "crew_companion": "Reseguide", "crew_companion_desc": "Kartor, mat, transport",
      "crew_claim": "Reklamationshjälpen", "crew_claim_desc": "Skapa din reklamation nu",
      "crew_insurance": "Villkorsläsaren", "crew_insurance_desc": "Förstå din reseförsäkring"
    },
    "da": {
      "nav_crew": "AI-crew", "crew_title": "AI-crew",
      "crew_subtitle": "Dit team på jorden. Spørg om hvad som helst.",
      "crew_bag": "Kuffert-tracker", "crew_bag_desc": "Kuffertstatus og alarmer i realtid",
      "crew_flight": "Flydesk", "crew_flight_desc": "Gateændringer, forsinkelser",
      "crew_companion": "Rejseguide", "crew_companion_desc": "Kort, mad, transport",
      "crew_claim": "Klagehjælperen", "crew_claim_desc": "Udarbejd din klage nu",
      "crew_insurance": "Policelæseren", "crew_insurance_desc": "Forstå din rejseforsikring"
    },
    "fi": {
      "nav_crew": "AI-tiimi", "crew_title": "AI-tiimi",
      "crew_subtitle": "Tiimisi maan pinnalla. Kysy mitä vain.",
      "crew_bag": "Laukkuseuranta", "crew_bag_desc": "Laukun tila ja hälytykset reaaliajassa",
      "crew_flight": "Lentotiski", "crew_flight_desc": "Porttimuutokset, viivästykset",
      "crew_companion": "Matkaopas", "crew_companion_desc": "Kartat, ruoka, liikenne",
      "crew_claim": "Korvausapuri", "crew_claim_desc": "Laadi hakemuksesi nyt",
      "crew_insurance": "Ehtojen lukija", "crew_insurance_desc": "Ymmärrä matkavakuutuksesi"
    },
    "el": {
      "nav_crew": "Πλήρωμα AI", "crew_title": "Πλήρωμα AI",
      "crew_subtitle": "Η ομάδα σας στο έδαφος. Ρωτήστε οτιδήποτε.",
      "crew_bag": "Εντοπιστής αποσκευών", "crew_bag_desc": "Κατάσταση βαλίτσας και ειδοποιήσεις σε πραγματικό χρόνο",
      "crew_flight": "Γραφείο πτήσεων", "crew_flight_desc": "Αλλαγές πύλης, καθυστερήσεις",
      "crew_companion": "Ταξιδιωτικός οδηγός", "crew_companion_desc": "Χάρτες, φαγητό, μετακινήσεις",
      "crew_claim": "Βοηθός αποζημίωσης", "crew_claim_desc": "Συντάξτε την αίτησή σας τώρα",
      "crew_insurance": "Αναγνώστης συμβολαίου", "crew_insurance_desc": "Αποκωδικοποιήστε το ταξιδιωτικό σας συμβόλαιο"
    },
    "he": {
      "nav_crew": "צוות AI", "crew_title": "צוות AI",
      "crew_subtitle": "הצוות שלך על הקרקע. שאל כל דבר.",
      "crew_bag": "מעקב מזוודות", "crew_bag_desc": "סטטוס והתראות מזוודה בזמן אמת",
      "crew_flight": "דלפק טיסות", "crew_flight_desc": "שינויי שער, עיכובים",
      "crew_companion": "מדריך טיולים", "crew_companion_desc": "מפות, אוכל, תחבורה",
      "crew_claim": "עוזר התביעות", "crew_claim_desc": "נסח את התביעה שלך עכשיו",
      "crew_insurance": "קורא הפוליסה", "crew_insurance_desc": "פענח את פוליסת הנסיעות שלך"
    }
  };
  Object.keys(ADD).forEach(function(code){
    if (!BAGPING_I18N[code]) BAGPING_I18N[code] = {};
    for (var k in ADD[code]) {
      if (Object.prototype.hasOwnProperty.call(ADD[code], k)) BAGPING_I18N[code][k] = ADD[code][k];
    }
  });
})();