var DB = require('../main.js')(require('../../db_file/main.js'))

  , spec = {
      fields: {
          text: {
              type: String,
              safe: true,
              transform: ['toLowerCase']
          },
          list: {
              type: [String]
          },
          value: {
              type: Number,
              safe: true
          },
          flag: {
              type: Boolean,
              safe: true
          },
          data: {
              type: Object,
              safe: true
          },
          user: {
              type: String,
              synonyms: ['username']
          },
          created: {
              type: Date,
              safe: true
          }
      }
  }

  , Schema = DB.schema('test', spec)
  , testData = {
        text:   'Testing',
        list:   ['Hello', 'World'],
        value:  150,
        flag:   false,
        data:   { something: 'yes' },
        created: new Date()
    }
  , test = new Schema(testData);

describe('DB (Schema)', function() {
    
    it('should instantiate', function() {
        
        expect(test.spec).toEqual(spec);
        expect(test.name).toEqual('test');
        expect(test.syns).toEqual( [{field:'user',syns:['username']}] );
        expect(test.whitelist).toEqual( ['text', 'value', 'flag', 'data', 'created'] );
        
    });
    
    it('should serialize properly', function() {
        
        var serialized = testData;
        serialized.created = {$date: testData.created.valueOf()};
        serialized._id = test.id;
        serialized.text = testData.text.toLowerCase();
        delete serialized.list;
        
        expect(JSON.parse(test.serialize())).toEqual(serialized);
        
    });
    
    it('should respect driver _id generation', function() {
        console.log(test.id, test._id);
        if(DB.hasId)    expect(test.id).toBeUndefined();
        else            expect(test.id).toBeDefined();
    });
    
});