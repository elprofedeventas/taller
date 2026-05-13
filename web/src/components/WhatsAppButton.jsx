// components/WhatsAppButton.jsx
import { useState } from 'react';
import { sendWhatsApp, renderTemplate } from '../services/whatsapp';
import { useAuth } from '../hooks/useAuth';
import styles from './WhatsAppButton.module.css';

export function WhatsAppButton({
  phone,
  templates = [],
  variables = {},
  context = {},
  buttonLabel = 'WhatsApp'
}) {
  const { session } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id || null);
  const [editedMessage, setEditedMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleOpen = () => {
    if (templates.length === 0) {
      setEditedMessage('');
    } else {
      const initial = templates[0];
      setSelectedTemplateId(initial.id);
      setEditedMessage(renderTemplate(initial.template, variables));
    }
    setModalOpen(true);
  };

  const handleSelectTemplate = (templateId) => {
    setSelectedTemplateId(templateId);
    const tpl = templates.find(t => t.id === templateId);
    if (tpl) {
      setEditedMessage(renderTemplate(tpl.template, variables));
    }
  };

  const handleSend = async () => {
    setSending(true);
    try {
      const tpl = templates.find(t => t.id === selectedTemplateId);
      await sendWhatsApp({
        phone,
        message: editedMessage,
        session,
        context: {
          ...context,
          templateName: tpl?.name || 'libre'
        }
      });
      setModalOpen(false);
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button onClick={handleOpen} className={styles.btn}>
        {buttonLabel}
      </button>

      {modalOpen && (
        <div className={styles.modalBg} onClick={() => setModalOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.title}>Enviar WhatsApp</h3>

            {templates.length > 0 && (
              <div className={styles.templates}>
                <label className={styles.label}>Plantilla:</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => handleSelectTemplate(e.target.value)}
                  className={styles.select}
                >
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
            )}

            <label className={styles.label}>Mensaje (editable):</label>
            <textarea
              value={editedMessage}
              onChange={(e) => setEditedMessage(e.target.value)}
              rows={6}
              className={styles.textarea}
            />

            <div className={styles.actions}>
              <button
                onClick={() => setModalOpen(false)}
                className={styles.btnSecondary}
                disabled={sending}
              >Cancelar</button>
              <button
                onClick={handleSend}
                disabled={sending || !editedMessage.trim()}
                className={styles.btn}
              >
                {sending ? 'Abriendo...' : 'Abrir WhatsApp'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
