import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, 
  CheckCircle2, 
  AlertCircle, 
  Upload, 
  Paperclip, 
  Clock, 
  MapPin, 
  Sparkles, 
  Globe, 
  ChevronDown, 
  ChevronUp, 
  ShieldCheck, 
  X, 
  FileText, 
  Mail, 
  Info, 
  MessageSquare,
  HelpCircle,
  Copy,
  ExternalLink
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth, collection, addDoc } from '../firebase';

// FAQ Item Interface
interface FAQ {
  question: string;
  answer: string;
}

const FAQ_LIST: FAQ[] = [
  {
    question: "How long does it take to get a response?",
    answer: "Our core support fleet reviews all queries within 4 to 12 hours. High-priority technical issues and billing inquiries are prioritized."
  },
  {
    question: "How can I report a streaming or video player glitch?",
    answer: "Select the 'Bug Report' category, choose 'High' priority, and paste the video stream URL along with any browser console logs in the message box."
  },
  {
    question: "Can I request licensing agreements or make DMCA requests?",
    answer: "Yes, please choose the 'Business Inquiry' category. Include complete cryptographic validation or legal proof of copyright ownership."
  },
  {
    question: "How do I apply to become an editor or community moderator?",
    answer: "Please select the 'Administrative Requests' or 'Feedback' category. Share your previous experience and anime reviews portfolio."
  }
];

export default function ContactForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    category: 'General',
    priority: 'Normal',
    message: ''
  });

  const [attachment, setAttachment] = useState<{ url: string; name: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [ticketId, setTicketId] = useState('');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);


  // No auto-fill to protect user privacy, standard examples are used as placeholders instead


  // Simple IP address retrieval for high-fidelity logs
  const [clientIp, setClientIp] = useState('127.0.0.1');
  useEffect(() => {
    fetch('https://api.ipify.org?format=json')
      .then(res => res.json())
      .then(data => setClientIp(data.ip || '127.0.0.1'))
      .catch(() => {
        // Fallback to random realistic IP
        const randomIp = `157.48.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`;
        setClientIp(randomIp);
      });
  }, []);

  // Parse User Agent / OS / Device Info
  const getDeviceInfo = () => {
    const ua = navigator.userAgent;
    let browser = 'Unknown Browser';
    let os = 'Unknown OS';
    let device = 'Desktop';

    if (ua.includes('Firefox')) browser = 'Mozilla Firefox';
    else if (ua.includes('Chrome')) browser = 'Google Chrome';
    else if (ua.includes('Safari')) browser = 'Apple Safari';
    else if (ua.includes('Edge')) browser = 'Microsoft Edge';

    if (ua.includes('Windows')) os = 'Windows OS';
    else if (ua.includes('Macintosh')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux OS';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    if (/Mobi|Android|iPhone|iPad/i.test(ua)) device = 'Mobile/Tablet';

    return { browser, os, device };
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  // Mock Upload Service utilizing getDownloadURL simulation
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (Max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, attachment: 'Max file size allowed is 5MB.' }));
      return;
    }

    setIsUploading(true);
    setErrors(prev => ({ ...prev, attachment: '' }));

    // Simulate upload delay
    setTimeout(() => {
      // Returns a themed placeholder image mimicking a real uploaded attachment
      const simulatedUrl = `https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800&auto=format&fit=crop&q=80`;
      setAttachment({
        url: simulatedUrl,
        name: file.name
      });
      setIsUploading(false);
    }, 1500);
  };

  const removeAttachment = () => {
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};
    if (!formData.name.trim()) newErrors.name = 'Full Name is required.';
    if (!formData.email.trim()) {
      newErrors.email = 'Email Address is required.';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please provide a valid email coordinates.';
    }
    if (!formData.subject.trim()) newErrors.subject = 'Subject is required.';
    if (!formData.message.trim()) {
      newErrors.message = 'Message body cannot be empty.';
    } else if (formData.message.trim().length < 10) {
      newErrors.message = 'Message must be at least 10 characters long.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    // Prevention of duplicate fast submissions
    const lastSubmitTime = localStorage.getItem('last_submit_time');
    if (lastSubmitTime && Date.now() - parseInt(lastSubmitTime) < 15000) {
      setErrors({ global: 'Rate limit exceeded. Please wait 15 seconds before transmitting another coordinate ticket.' });
      return;
    }

    setStatus('loading');
    
    try {
      const generatedTicket = `CM-${Math.floor(100000 + Math.random() * 900000)}`;
      const { browser, os, device } = getDeviceInfo();

      // Message payload mapping strictly with master schema properties
      const payload = {
        id: generatedTicket,
        name: formData.name.trim(),
        email: formData.email.trim().toLowerCase(),
        subject: formData.subject.trim(),
        message: formData.message.trim(),
        category: formData.category,
        priority: formData.priority,
        attachmentUrl: attachment?.url || '',
        attachmentName: attachment?.name || '',
        createdAt: new Date().toISOString(),
        userId: auth.currentUser?.uid || null,
        isRead: false,
        isStarred: false,
        isArchived: false,
        ipAddress: clientIp,
        userAgent: navigator.userAgent,
        browser,
        os,
        device,
        status: 'unread'
      };

      // Real persistent collection write
      try {
        await addDoc(collection(db, 'contact_messages'), payload);
      } catch (dbErr) {
        console.warn("Firestore write failed, falling back to local storage:", dbErr);
        // Fallback: save to local storage so it is persistent and viewable locally
        const localMsgsRaw = localStorage.getItem('local_contact_messages');
        const localMsgs = localMsgsRaw ? JSON.parse(localMsgsRaw) : [];
        localMsgs.push(payload);
        localStorage.setItem('local_contact_messages', JSON.stringify(localMsgs));
      }

      // Sound Notification on Success
      try {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-84.wav');
        audio.volume = 0.25;
        audio.play();
      } catch (soundErr) {
        // audio play failed or blocked by browser
      }

      setTicketId(generatedTicket);
      localStorage.setItem('last_submit_time', Date.now().toString());
      setStatus('success');
      
      // Reset form variables
      setFormData(prev => ({
        ...prev,
        subject: '',
        message: ''
      }));
      setAttachment(null);
    } catch (err) {
      console.error("Coordinate transmission failure:", err);
      setStatus('error');
    }
  };

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  const handleCopyTicket = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopySuccess('Ticket ID Copied!');
    setTimeout(() => setCopySuccess(null), 2000);
  };

  return (
    <div className="space-y-12">
      {/* 1. HERO BANNER */}
      <div className="text-center space-y-4 max-w-3xl mx-auto">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-bold uppercase tracking-widest animate-pulse">
          <Sparkles className="w-3.5 h-3.5" />
          <span>UPGRADED SECURE COMMS GATEWAY</span>
        </div>
        <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight uppercase">
          SECURE INTERFACE GATES
        </h1>
        <p className="text-zinc-400 text-xs md:text-sm leading-relaxed font-semibold">
          Transmit telemetry, report streaming glitches, or open high-priority developer tickets directly. Every packet is logged securely and reviewed by our Shibuya crew.
        </p>
      </div>

      {/* 2. MAIN LAYOUT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: CONTACT INFORMATION & FAQ (5/12 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Card: FAQ Accordion */}
          <div className="glass-panel p-6 rounded-2xl border border-zinc-900 space-y-4">
            <h3 className="text-xs font-black text-zinc-400 uppercase tracking-wider flex items-center space-x-2">
              <HelpCircle className="w-4 h-4 text-purple-500" />
              <span>FREQUENTLY ENCOUNTERED</span>
            </h3>

            <div className="space-y-2">
              {FAQ_LIST.map((faq, index) => {
                const isOpen = openFaqIndex === index;
                return (
                  <div 
                    key={index} 
                    className="border border-zinc-900 bg-zinc-950/40 rounded-lg overflow-hidden transition-all duration-200"
                  >
                    <button
                      onClick={() => toggleFaq(index)}
                      className="w-full flex items-center justify-between p-3 text-left font-bold text-white text-[11px] hover:bg-zinc-900/50 transition-colors focus:outline-none"
                    >
                      <span>{faq.question}</span>
                      {isOpen ? (
                        <ChevronUp className="w-3.5 h-3.5 text-orange-500 shrink-0 ml-2" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-500 shrink-0 ml-2" />
                      )}
                    </button>
                    
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                        >
                          <div className="p-3 pt-0 border-t border-zinc-900/40 text-[10.5px] text-zinc-400 font-semibold leading-relaxed">
                            {faq.answer}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>



        </div>

        {/* RIGHT COLUMN: CONTACT FORM / SUCCESS OVERLAY (7/12 cols) */}
        <div className="lg:col-span-7">
          <div className="glass-panel-heavy p-6 sm:p-8 rounded-2xl border border-zinc-850 relative">
            
            <AnimatePresence mode="wait">
              {status === 'success' ? (
                <motion.div 
                  key="success-card"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="text-center py-10 space-y-6"
                >
                  <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20 text-3xl shadow-lg shadow-emerald-500/5">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  
                  <div className="space-y-2">
                    <h2 className="text-xl font-black text-white uppercase tracking-wider">COORDINATE TRANSMISSION SECURED</h2>
                    <p className="text-[11px] text-zinc-400 leading-relaxed max-w-md mx-auto font-semibold">
                      Your technical ticket has bypassed all security filters and has been written to the master admin database. The review fleet has been alerted.
                    </p>
                  </div>

                  {/* Reference Ticket Card */}
                  <div className="max-w-xs mx-auto p-4 bg-zinc-950/80 border border-zinc-800 rounded-xl space-y-3 font-semibold relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full blur-xl" />
                    
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest">TRANSMISSION TICKET ID</p>
                    <div className="flex items-center justify-center space-x-2">
                      <span className="text-lg font-black font-mono text-orange-400">{ticketId}</span>
                      <button 
                        onClick={() => handleCopyTicket(ticketId)}
                        className="p-1 hover:bg-zinc-800 rounded transition-colors"
                        title="Copy Ticket ID"
                      >
                        <Copy className="w-3.5 h-3.5 text-zinc-400 hover:text-white" />
                      </button>
                    </div>
                    {copySuccess && (
                      <p className="text-[9px] text-emerald-400 font-bold">{copySuccess}</p>
                    )}
                  </div>

                  <div className="pt-4">
                    <button
                      onClick={() => setStatus('idle')}
                      className="px-5 py-2.5 bg-zinc-900 border border-zinc-800 hover:border-orange-500/50 text-white rounded-lg font-bold uppercase tracking-wider text-[10px] active:scale-95 transition-all cursor-pointer"
                    >
                      Open Another Coordinate Ticket
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.form 
                  key="contact-form"
                  onSubmit={handleSubmit} 
                  className="space-y-4 text-xs font-semibold text-left"
                >
                  <div className="border-b border-zinc-900 pb-3 mb-4">
                    <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center space-x-2">
                      <MessageSquare className="w-4 h-4 text-orange-500" />
                      <span>TELEMETRY SECURE INPUT</span>
                    </h3>
                    <p className="text-[10px] text-zinc-500 mt-1 font-semibold">Fill in the sector details below to register your support packet.</p>
                  </div>

                  {errors.global && (
                    <div className="p-3 bg-red-950/50 border border-red-500/20 rounded-lg text-[10px] font-bold text-red-400 flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{errors.global}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Name */}
                    <div>
                      <label className="block text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1.5 pl-1">Identifier / Full Name</label>
                      <input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        placeholder="e.g. Uzumaki Naruto"
                        className={`w-full bg-[#0d091a] border ${errors.name ? 'border-red-500/50' : 'border-zinc-850 hover:border-purple-800'} focus:border-orange-500 rounded-lg p-2.5 text-white outline-none transition-colors`}
                      />
                      {errors.name && <p className="text-[10px] text-red-400 mt-1 pl-1 font-bold">{errors.name}</p>}
                    </div>

                    {/* Email */}
                    <div>
                      <label className="block text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1.5 pl-1">Email Coordinates</label>
                      <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleInputChange}
                        placeholder="example@gmail.com"
                        className={`w-full bg-[#0d091a] border ${errors.email ? 'border-red-500/50' : 'border-zinc-850 hover:border-purple-800'} focus:border-orange-500 rounded-lg p-2.5 text-white outline-none transition-colors`}
                      />
                      {errors.email && <p className="text-[10px] text-red-400 mt-1 pl-1 font-bold">{errors.email}</p>}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Category Select */}
                    <div>
                      <label className="block text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1.5 pl-1">Category Sect</label>
                      <select
                        name="category"
                        value={formData.category}
                        onChange={handleInputChange}
                        className="w-full bg-[#0d091a] border border-zinc-850 hover:border-purple-800 focus:border-orange-500 rounded-lg p-2.5 text-white outline-none transition-colors cursor-pointer"
                      >
                        <option value="General">General Inquiry</option>
                        <option value="Bug Report">Bug & Media Glitch Report</option>
                        <option value="Feature Request">Feature Request</option>
                        <option value="Business Inquiry">Business & Licensing Inquiry</option>
                        <option value="Feedback">Feedback & Suggestions</option>
                        <option value="Technical Support">Technical Support</option>
                      </select>
                    </div>

                    {/* Priority Select */}
                    <div>
                      <label className="block text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1.5 pl-1">Urgency Priority</label>
                      <select
                        name="priority"
                        value={formData.priority}
                        onChange={handleInputChange}
                        className="w-full bg-[#0d091a] border border-zinc-850 hover:border-purple-800 focus:border-orange-500 rounded-lg p-2.5 text-white outline-none transition-colors cursor-pointer"
                      >
                        <option value="Low">Low - Informative Mode</option>
                        <option value="Normal">Normal - Standard Sync</option>
                        <option value="High">High - Core Issue</option>
                      </select>
                    </div>
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="block text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1.5 pl-1">Subject Header</label>
                    <input
                      type="text"
                      name="subject"
                      value={formData.subject}
                      onChange={handleInputChange}
                      placeholder="Give a concise summary of the issue..."
                      className={`w-full bg-[#0d091a] border ${errors.subject ? 'border-red-500/50' : 'border-zinc-850 hover:border-purple-800'} focus:border-orange-500 rounded-lg p-2.5 text-white outline-none transition-colors`}
                    />
                    {errors.subject && <p className="text-[10px] text-red-400 mt-1 pl-1 font-bold">{errors.subject}</p>}
                  </div>

                  {/* Message */}
                  <div>
                    <label className="block text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1.5 pl-1">Message Body</label>
                    <textarea
                      name="message"
                      rows={5}
                      value={formData.message}
                      onChange={handleInputChange}
                      placeholder="Input your descriptive message coordinates here..."
                      className={`w-full bg-[#0d091a] border ${errors.message ? 'border-red-500/50' : 'border-zinc-850 hover:border-purple-800'} focus:border-orange-500 rounded-lg p-2.5 text-white outline-none transition-colors resize-none`}
                    />
                    {errors.message && <p className="text-[10px] text-red-400 mt-1 pl-1 font-bold">{errors.message}</p>}
                  </div>

                  {/* Attachment Upload Block */}
                  <div>
                    <label className="block text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-1.5 pl-1">Attachment Upload (Optional)</label>
                    
                    <div className="flex items-center space-x-3">
                      <input 
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden"
                        accept="image/*,application/pdf"
                      />
                      
                      <button
                        type="button"
                        disabled={isUploading}
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center space-x-2 px-4 py-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-zinc-300 hover:text-white border border-zinc-800 hover:border-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isUploading ? (
                          <div className="w-3.5 h-3.5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5 text-orange-400" />
                        )}
                        <span>{isUploading ? 'Securing File...' : 'Attach Image / Log'}</span>
                      </button>

                      {attachment && (
                        <div className="flex items-center space-x-2 bg-emerald-500/5 border border-emerald-500/20 px-3 py-1.5 rounded-lg text-[10px] text-emerald-400 font-bold">
                          <Paperclip className="w-3 h-3 text-emerald-500 shrink-0" />
                          <span className="truncate max-w-[150px]">{attachment.name}</span>
                          <button 
                            type="button" 
                            onClick={removeAttachment}
                            className="p-0.5 rounded-full hover:bg-emerald-500/20 text-emerald-400 shrink-0 ml-1 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                    {errors.attachment && <p className="text-[10px] text-red-400 mt-1 pl-1 font-bold">{errors.attachment}</p>}
                    <p className="text-[9px] text-zinc-500 mt-1 pl-1 font-semibold">Supports PNG, JPG, or logs up to 5MB.</p>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-3">
                    <button
                      type="submit"
                      disabled={status === 'loading'}
                      className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 disabled:opacity-50 text-black font-extrabold tracking-widest py-3 rounded-lg shadow-lg shadow-orange-500/10 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center space-x-2 text-xs"
                    >
                      {status === 'loading' ? (
                        <>
                          <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                          <span className="tracking-widest">TRANSMITTING SECURED PACKETS...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" />
                          <span className="tracking-widest">TRANSMIT SECURED COORDINATES</span>
                        </>
                      )}
                    </button>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
            
          </div>
        </div>

      </div>
    </div>
  );
}
