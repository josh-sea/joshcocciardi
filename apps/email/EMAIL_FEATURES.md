# Email Features Documentation

## Implemented Features

### 1. Search Functionality
- **Search bar** with debounced input (500ms delay)
- Supports Gmail search syntax:
  - `from:john` - Search by sender
  - `subject:meeting` - Search by subject
  - `has:attachment` - Emails with attachments
  - `after:2024/01/01` - Emails after a date
  - `is:unread` - Unread emails only
- Clear button (✕) to quickly reset search

### 2. Category Filtering
Four category filters available:
- **All** - All emails in inbox
- **Primary** - Personal emails (Gmail's primary category)
- **Starred** - Starred/favorited emails
- **Important** - Gmail's important emails

Categories can be combined with search queries.

### 3. Infinite Scroll Pagination
- Automatically loads 30 more emails when scrolling to 80% of the list
- Shows "Loading more..." indicator while fetching
- Shows "No more emails" when all emails have been loaded
- No manual "Load More" button needed

### 4. How Email Fetching Works

**Current Implementation:**
- Fetches 30 threads per page using Gmail API
- Processes threads in batches of 10 for optimal performance
- Uses Gmail API's `pageToken` for pagination
- Queries are built by combining search terms and category filters

**Limits:**
- 30 threads per request (configurable in `App.js`)
- No hard limit on total emails - keeps loading until no more available
- Respects Gmail API rate limits

**API Query Examples:**
```javascript
// All starred emails
'is:starred'

// Primary category with search
'category:primary subject:meeting'

// Important emails from specific sender
'is:important from:john@example.com'
```

## Future Enhancement: Frequent Contacts

### Concept
Similar to iMessage's pinned contacts, show most frequently interacted contacts/threads at the top of the inbox.

### Implementation Plan

1. **Interaction Tracking**
   - Track when user opens a thread
   - Track when user sends a reply
   - Track read receipts (already marking as read)
   - Store interaction data in Firebase Firestore

2. **Scoring Algorithm**
   ```javascript
   score = (opens × 1) + (replies × 3) + (recent_interaction_bonus)
   ```
   - Opening a thread: +1 point
   - Sending a reply: +3 points
   - Recent interactions (last 7 days): +2 point multiplier
   - Decay older interactions over time

3. **UI Changes**
   - Add "Frequent" section at top of thread list
   - Show top 5-10 frequent contacts with special styling
   - Add pin/unpin functionality for manual control

4. **Data Structure (Firestore)**
   ```javascript
   users/{userId}/interactions/{threadId} {
     threadId: string,
     opens: number,
     replies: number,
     lastInteraction: timestamp,
     isPinned: boolean,
     participants: array of emails
   }
   ```

### How to Implement

To add the frequent contacts feature:

1. **Update Firebase Rules** (`firestore.rules`):
   ```
   match /users/{userId}/interactions/{threadId} {
     allow read, write: if request.auth.uid == userId;
   }
   ```

2. **Create Interaction Tracking Service** (`src/services/interactions.js`):
   - `trackThreadOpen(userId, threadId, participants)`
   - `trackThreadReply(userId, threadId, participants)`
   - `getFrequentThreads(userId, limit)`
   - `pinThread(userId, threadId)`

3. **Update App.js**:
   - Load frequent threads on mount
   - Track interactions in `handleOpenThread` and `handleSendReply`

4. **Update ThreadList.js**:
   - Add "Frequent" section above regular threads
   - Add pin/unpin button to thread items

5. **Add Styling**:
   - Style for frequent section header
   - Pin icon styling
   - Separate frequent threads visually

## Usage Tips

- **Search Examples:**
  - Find all emails from a specific domain: `from:@company.com`
  - Find unread important emails: `is:unread is:important`
  - Find emails with PDFs: `filename:pdf`
  
- **Category Best Practices:**
  - Use "Primary" for personal conversations
  - Use "Starred" for emails you've marked as important
  - Combine filters: Search in Starred category for quick access

- **Performance:**
  - Search is debounced by 500ms - wait for typing to finish
  - Infinite scroll loads automatically - just keep scrolling
  - First load fetches 30 threads - subsequent loads add 30 more